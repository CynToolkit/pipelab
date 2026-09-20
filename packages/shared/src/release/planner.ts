import { validateReleaseConfigShape } from "./config";
import { evaluateArtifactAcceptance, matchesArtifact } from "./matcher";
import { resolveTargetDescriptor } from "./descriptor";
import type {
  ArtifactAcceptance,
  ArtifactDescriptor,
  ArtifactRef,
  ReleaseBuildProfileConfig,
  ReleaseConfig,
  ReleaseHostContext,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseProducerConfig,
  ReleaseProducerDefinition,
  ReleaseRegistry,
  ValidationIssue,
} from "./types";

const error = (code: string, message: string, path?: string): ValidationIssue => ({ code, message, severity: "error", path });
const sourceRef = (ref: ReleaseOutputRef): ref is { source: true } => "source" in ref && ref.source === true;
const internalRef = (ref: ReleaseOutputRef): ArtifactRef => sourceRef(ref) ? { source: true } : { producerId: ref.buildId, outputId: ref.targetId };
const keyFor = (ref: ReleaseOutputRef): string => sourceRef(ref) ? "source" : `${ref.buildId}:${ref.targetId}`;

const accepted = (
  artifact: ArtifactDescriptor,
  definition: ReleaseProducerDefinition,
  host: ReleaseHostContext,
): ArtifactAcceptance => {
  return evaluateArtifactAcceptance(artifact, definition.accepts, () => definition.acceptsWhen?.(artifact, { host, producer: definition }) ?? { accepted: true });
};

interface Candidate {
  ref: ReleaseOutputRef;
  artifactRef: ArtifactRef;
  descriptor: ArtifactDescriptor;
}

interface AutomaticStep {
  definition: ReleaseProducerDefinition;
  input: Candidate;
  targetId: string;
  descriptor: ArtifactDescriptor;
}

interface BuildResolution {
  candidateByTarget: Map<string, Candidate>;
  producer: ReleaseProducerConfig;
}

const findAutomaticPath = (
  candidate: Candidate,
  definition: ReleaseProducerDefinition,
  registry: ReleaseRegistry,
  host: ReleaseHostContext,
): AutomaticStep[] | undefined => {
  if (accepted(candidate.descriptor, definition, host).accepted) return [];
  const queue: Array<{ candidate: Candidate; steps: AutomaticStep[] }> = [{ candidate, steps: [] }];
  const visited = new Set<string>([candidate.descriptor.kind + JSON.stringify(candidate.descriptor)]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const transform of registry.producers.filter((producer) => producer.planning.mode === "automatic")) {
      if (!accepted(current.candidate.descriptor, transform, host).accepted) continue;
      for (const target of transform.targets) {
        if (target.isAvailable && !target.isAvailable(host).available) continue;
        const nextDescriptor = resolveTargetDescriptor(current.candidate.descriptor, target);
        if (!nextDescriptor) continue;
        const nextStep: AutomaticStep = { definition: transform, input: current.candidate, targetId: target.id, descriptor: nextDescriptor };
        if (accepted(nextDescriptor, definition, host).accepted) return [...current.steps, nextStep];
        const nextKey = nextDescriptor.kind + JSON.stringify(nextDescriptor);
        if (!visited.has(nextKey) && current.steps.length < registry.producers.length) {
          visited.add(nextKey);
          const nextCandidate: Candidate = { ref: { buildId: `__auto__${current.steps.length}`, targetId: target.id }, artifactRef: { producerId: `__auto__${current.steps.length}`, outputId: target.id }, descriptor: nextDescriptor };
          queue.push({ candidate: nextCandidate, steps: [...current.steps, nextStep] });
        }
      }
    }
  }
  return undefined;
};

export interface ReleasePlanningContext {
  host: ReleaseHostContext;
}

export const planRelease = (config: ReleaseConfig, registry: ReleaseRegistry, context: ReleasePlanningContext): ReleasePlan => {
  const issues = [...validateReleaseConfigShape(config)];
  const producers: ReleaseProducerConfig[] = [];
  const outputs: ReleasePlan["outputs"] = [];
  const graph: ReleasePlan["graph"] = { nodes: [{ id: "source", kind: "source" }], edges: [] };
  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  if (!source) issues.push(error("release.source.unknown", `Unknown source provider: ${config.source.provider}`, "source.provider"));
  else issues.push(...source.validate(config.source.config).map((issue) => ({ ...issue, path: issue.path ? `source.${issue.path}` : "source" })));

  const builds = new Map<string, ReleaseBuildProfileConfig>();
  for (const [index, build] of (config.builds ?? []).entries()) {
    if (builds.has(build.id)) issues.push(error("release.build.id.duplicate", `Build ID is not unique: ${build.id}.`, `builds.${index}.id`));
    builds.set(build.id, build);
  }

  const resolved = new Map<string, Candidate>();
  if (source) resolved.set("source", { ref: { source: true }, artifactRef: { source: true }, descriptor: source.output });
  const resolving = new Set<string>();
  const automaticCounter = new Map<string, number>();

  const addAutomatic = (steps: AutomaticStep[], destinationBuildId: string): Candidate => {
    let candidate = steps[0].input;
    for (const step of steps) {
      const index = (automaticCounter.get(destinationBuildId) ?? 0) + 1;
      automaticCounter.set(destinationBuildId, index);
      const id = `__auto__${destinationBuildId}__${index}`;
      const target = step.definition.targets.find((item) => item.id === step.targetId)!;
      const producer: ReleaseProducerConfig = {
        id,
        provider: step.definition.id,
        enabled: true,
        input: candidate.artifactRef,
        config: step.definition.createDefaultConfig(),
        targets: [{ id: step.targetId, enabled: true, config: target.createDefaultConfig() }],
      };
      producers.push(producer);
      graph.nodes.push({ id, kind: "automatic" });
      graph.edges.push({ from: sourceRef(candidate.ref) ? "source" : candidate.ref.buildId, to: id });
      candidate = { ref: { buildId: id, targetId: step.targetId }, artifactRef: { producerId: id, outputId: step.targetId }, descriptor: step.descriptor };
      resolved.set(keyFor(candidate.ref), candidate);
      outputs.push({ buildId: id, targetId: step.targetId, ref: candidate.ref, artifactRef: candidate.artifactRef, descriptor: candidate.descriptor });
    }
    return candidate;
  };

  const resolveBuild = (buildId: string): BuildResolution | undefined => {
    const build = builds.get(buildId);
    if (!build || !build.enabled) return undefined;
    if (resolving.has(buildId)) {
      issues.push(error("release.build.input.cycle", `Build cycle detected at ${buildId}.`, `builds.${buildId}.input`));
      return undefined;
    }
    const existing = resolved.get(`${buildId}:__profile__`);
    if (existing) return { candidateByTarget: new Map(), producer: producers.find((item) => item.id === buildId)! };
    const definition = registry.producers.find((candidate) => candidate.id === build.engine);
    if (!definition) {
      issues.push(error("release.build.engine.unknown", `Unknown build engine: ${build.engine}.`, `builds.${buildId}.engine`));
      return undefined;
    }
    if (definition.planning.mode === "automatic") issues.push(error("release.build.engine.automatic", `Automatic producer ${build.engine} cannot be selected as a build engine.`, `builds.${buildId}.engine`));
    resolving.add(buildId);
    let candidates: Candidate[] = [];
    if (build.input) {
      const inputCandidate = resolveRef(build.input);
      if (inputCandidate) candidates = [inputCandidate];
    } else {
      candidates = [...resolved.values()].filter((candidate) => (sourceRef(candidate.ref) || candidate.ref.targetId !== "__profile__") && !(!sourceRef(candidate.ref) && candidate.ref.buildId === buildId));
    }
    let selected: Candidate | undefined;
    let selectedTransforms: AutomaticStep[] = [];
    for (const candidate of candidates) {
      const directAcceptance = accepted(candidate.descriptor, definition, context.host);
      const path = findAutomaticPath(candidate, definition, registry, context.host);
      if (path) {
        if (selected) {
          issues.push(error("release.build.input.ambiguous", `Build ${buildId} has multiple compatible inputs.`, `builds.${buildId}.input`));
          break;
        }
        selected = candidate;
        selectedTransforms = path;
      } else if (matchesArtifact(candidate.descriptor, definition.accepts) && !directAcceptance.accepted && "reason" in directAcceptance && directAcceptance.reason) {
        issues.push(error("release.build.input.rejected", directAcceptance.reason, `builds.${buildId}.input`));
      }
    }
    if (!selected) {
      if (build.input) issues.push(error("release.build.input.missing", `Build ${buildId} has no compatible input.`, `builds.${buildId}.input`));
      resolving.delete(buildId);
      return undefined;
    }
    if (selectedTransforms.length) selected = addAutomatic(selectedTransforms, buildId);
    const targetConfigs = build.targets.filter((target) => target.enabled).map((target) => {
      const targetDefinition = definition.targets.find((item) => item.id === target.id);
      if (!targetDefinition) {
        issues.push(error("release.build.target.unknown", `Unknown target ${target.id} for ${build.engine}.`, `builds.${buildId}.targets`));
        return target;
      }
      if (targetDefinition.buildType && targetDefinition.buildType !== build.type) issues.push(error("release.build.target.type", `Target ${target.id} is not a ${build.type} target.`, `builds.${buildId}.targets`));
      if (targetDefinition.isAvailable) {
        const availability = targetDefinition.isAvailable(context.host);
        if (!availability.available) issues.push(error("release.build.target.unavailable", availability.reason ?? `Target ${target.id} is unavailable.`, `builds.${buildId}.targets`));
      }
      return target;
    });
    const producer: ReleaseProducerConfig = { id: build.id, provider: build.engine, enabled: true, input: selected.artifactRef, config: build.config, targets: targetConfigs };
    issues.push(...definition.validate(producer, { host: context.host, source: selected.descriptor, sourceConfig: config.source.config }).map((issue) => ({ ...issue, path: issue.path ? `builds.${buildId}.${issue.path}` : `builds.${buildId}` })));
    producers.push(producer);
    graph.nodes.push({ id: build.id, kind: "build" });
    graph.edges.push({ from: sourceRef(selected.ref) ? "source" : selected.ref.buildId, to: build.id });
    const resolution: BuildResolution = { candidateByTarget: new Map(), producer };
    for (const target of targetConfigs) {
      const targetDefinition = definition.targets.find((item) => item.id === target.id);
      if (!targetDefinition || !target.enabled) continue;
      const descriptor = resolveTargetDescriptor(selected.descriptor, targetDefinition);
      if (!descriptor) {
        issues.push(error("release.build.target.descriptor", `Target ${target.id} does not declare an output descriptor.`, `builds.${buildId}.targets`));
        continue;
      }
      const candidate: Candidate = { ref: { buildId, targetId: target.id }, artifactRef: { producerId: buildId, outputId: target.id }, descriptor };
      resolution.candidateByTarget.set(target.id, candidate);
      resolved.set(`${buildId}:${target.id}`, candidate);
      outputs.push({ buildId, targetId: target.id, ref: candidate.ref, artifactRef: candidate.artifactRef, descriptor });
    }
    resolved.set(`${buildId}:__profile__`, { ref: { buildId, targetId: "__profile__" }, artifactRef: { producerId: buildId, outputId: "__profile__" }, descriptor: selected.descriptor });
    resolving.delete(buildId);
    return resolution;
  };

  function resolveRef(ref: ReleaseOutputRef): Candidate | undefined {
    if (sourceRef(ref)) return resolved.get("source");
    const build = builds.get(ref.buildId);
    if (!build || !build.enabled) {
      issues.push(error("release.build.reference.disabled", `Referenced build is missing or disabled: ${ref.buildId}.`));
      return undefined;
    }
    if (!resolved.has(`${ref.buildId}:${ref.targetId}`)) resolveBuild(ref.buildId);
    return resolved.get(`${ref.buildId}:${ref.targetId}`);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const before = resolved.size;
    for (const build of config.builds ?? []) if (build.enabled) resolveBuild(build.id);
    if (resolved.size > before) changed = true;
  }
  for (const build of config.builds ?? []) if (build.enabled && !resolved.has(`${build.id}:__profile__`)) issues.push(error("release.build.input.missing", `Build ${build.id} has no compatible input.`, `builds.${build.id}.input`));
  const destinations: ReleasePlan["destinations"] = [];
  for (const [index, destination] of (config.destinations ?? []).entries()) {
    if (!destination.enabled) continue;
    const definition = registry.destinations.find((candidate) => candidate.id === destination.provider);
    if (!definition) {
      issues.push(error("release.destination.unknown", `Unknown destination provider: ${destination.provider}.`, `destinations.${index}.provider`));
      continue;
    }
    issues.push(...definition.validate(destination, { host: context.host }).map((issue) => ({ ...issue, path: issue.path ? `destinations.${index}.${issue.path}` : `destinations.${index}` })));
    if (!destination.slots.some((slot) => slot.enabled)) issues.push(error("release.destination.slot.required", `Destination ${destination.id} must have an enabled slot.`, `destinations.${index}.slots`));
    const slots = destination.slots.filter((slot) => slot.enabled).map((slot) => {
      const candidate = resolveRef(slot.input);
      if (!candidate) return { ...slot, input: internalRef(slot.input) };
      const acceptance = evaluateArtifactAcceptance(candidate.descriptor, definition.accepts, () => definition.acceptsWhen?.(candidate.descriptor, { host: context.host, destination: definition }) ?? { accepted: true });
      if (!acceptance.accepted) issues.push(error("release.destination.input.incompatible", "reason" in acceptance && acceptance.reason ? acceptance.reason : `Destination ${destination.id} cannot consume the selected output.`, `destinations.${index}.slots`));
      graph.nodes.push({ id: `${destination.id}:${slot.id}`, kind: "destination" });
      graph.edges.push({ from: sourceRef(candidate.ref) ? "source" : candidate.ref.buildId, to: `${destination.id}:${slot.id}` });
      return { ...slot, input: candidate.artifactRef };
    });
    destinations.push({ ...destination, slots });
  }
  return { producers, outputs, destinations, issues, graph };
};

export const planArtifactAccepted = accepted;
