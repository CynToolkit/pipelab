import { matchesArtifact } from "./matcher";
import { validateReleaseConfigShape } from "./config";
import { resolveTargetDescriptor } from "./descriptor";
import type { ArtifactDescriptor } from "@pipelab/workflow-runtime";
import type { ArtifactRef, ReleaseConfig, ReleaseProducerConfig, ReleaseProducerDefinition, ReleaseRegistry, ReleaseValidationContext, ValidationIssue } from "./types";

const error = (code: string, message: string, path?: string): ValidationIssue => ({ code, message, severity: "error", path });
const isSourceRef = (ref: ArtifactRef): ref is { source: true } => "source" in ref && ref.source === true;
const prefixIssues = (issues: ValidationIssue[], prefix: string): ValidationIssue[] => issues.map((issue) => ({ ...issue, path: issue.path ? `${prefix}.${issue.path}` : prefix }));

export const validateRelease = (config: ReleaseConfig, registry: ReleaseRegistry, context: ReleaseValidationContext): ValidationIssue[] => {
  const issues = [...validateReleaseConfigShape(config)];
  if (issues.some((issue) => issue.severity === "error")) return issues;
  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  if (!source) return [...issues, error("release.source.unknown", `Unknown source provider: ${config.source.provider}`, "source.provider")];
  issues.push(...prefixIssues(source.validate(config.source.config), "source"));

  const producerConfigs = new Map<string, ReleaseProducerConfig>();
  const producerDefinitions = new Map<string, ReleaseProducerDefinition>();
  for (const [producerIndex, producer] of config.producers.entries()) {
    const producerPath = `producers.${producerIndex}`;
    if (producerConfigs.has(producer.id)) issues.push(error("release.producer.id.duplicate", `Producer ID is not unique: ${producer.id}`, `${producerPath}.id`));
    producerConfigs.set(producer.id, producer);
    if (!producer.enabled) continue;
    const definition = registry.producers.find((candidate) => candidate.id === producer.provider);
    if (!definition) { issues.push(error("release.producer.unknown", `Unknown producer provider: ${producer.provider}`, `${producerPath}.provider`)); continue; }
    producerDefinitions.set(producer.id, definition);
  }

  const resolved = new Map<string, ArtifactDescriptor>();
  const resolving = new Set<string>();
  const reported = new Set<string>();
  const report = (issue: ValidationIssue): void => {
    const key = `${issue.code}:${issue.path || ""}:${issue.message}`;
    if (!reported.has(key)) { reported.add(key); issues.push(issue); }
  };

  const resolveProducerOutput = (producerId: string, outputId: string, path: string): ArtifactDescriptor | undefined => {
    const key = `${producerId}:${outputId}`;
    const cached = resolved.get(key);
    if (cached) return cached;
    if (resolving.has(producerId)) { report(error("release.producer.input.cycle", `Producer cycle detected while resolving ${producerId}.`, path)); return undefined; }
    const producer = producerConfigs.get(producerId);
    const definition = producerDefinitions.get(producerId);
    if (!producer) { report(error("release.producer.input.unknown", `Referenced producer does not exist: ${producerId}.`, path)); return undefined; }
    if (!producer.enabled) { report(error("release.producer.disabled", `Referenced producer is disabled: ${producerId}.`, path)); return undefined; }
    if (!definition) { report(error("release.producer.input.unknown", `Referenced producer provider is unavailable: ${producerId}.`, path)); return undefined; }
    const configuredTarget = producer.targets.find((candidate) => candidate.id === outputId);
    if (!configuredTarget || !configuredTarget.enabled) { report(error("release.producer.target.disabled", `Referenced producer target is disabled: ${producerId}/${outputId}.`, path)); return undefined; }
    const target = definition.targets.find((candidate) => candidate.id === outputId);
    if (!target) { report(error("release.producer.output.unknown", `Producer ${producerId} has no target output ${outputId}.`, path)); return undefined; }
    resolving.add(producerId);
    const input = producer.input ?? { source: true as const };
    const inputDescriptor = isSourceRef(input) ? source.output : resolveProducerOutput(input.producerId, input.outputId, `producers.${producerId}.input`);
    resolving.delete(producerId);
    if (!inputDescriptor) return undefined;
    const descriptor = resolveTargetDescriptor(inputDescriptor, target);
    if (!descriptor) { report(error("release.producer.output.unknown", `Producer ${producerId} target ${outputId} does not declare an artifact descriptor.`, `producers.${producerId}.targets`)); return undefined; }
    resolved.set(key, descriptor);
    return descriptor;
  };

  for (const [producerIndex, producer] of config.producers.entries()) {
    const producerPath = `producers.${producerIndex}`;
    const definition = producerDefinitions.get(producer.id);
    if (!definition) continue;
    const input = producer.input ?? { source: true as const };
    if (!isSourceRef(input) && !producerConfigs.has(input.producerId)) report(error("release.producer.input.unknown", `Producer ${producer.id} references unknown producer ${input.producerId}.`, `${producerPath}.input`));
    const inputDescriptor = isSourceRef(input) ? source.output : resolveProducerOutput(input.producerId, input.outputId, `${producerPath}.input`);
    if (inputDescriptor && !matchesArtifact(inputDescriptor, definition.accepts)) report(error("release.producer.input.incompatible", `Producer ${producer.id} cannot consume its selected artifact.`, `${producerPath}.input`));
    issues.push(...prefixIssues(definition.validate(producer, { ...context, source: inputDescriptor || source.output, sourceConfig: config.source.config }), producerPath));
    const targetIds = new Set<string>();
    for (const [targetIndex, target] of producer.targets.entries()) {
      const targetPath = `${producerPath}.targets.${targetIndex}`;
      if (targetIds.has(target.id)) issues.push(error("release.target.id.duplicate", `Target ID is not unique within producer ${producer.id}: ${target.id}`, `${targetPath}.id`));
      targetIds.add(target.id);
      const targetDefinition = definition.targets.find((candidate) => candidate.id === target.id);
      if (!targetDefinition) { issues.push(error("release.target.unknown", `Unknown target ${target.id} for producer ${producer.provider}.`, `${targetPath}.id`)); continue; }
      if (target.enabled && targetDefinition.isAvailable) { const availability = targetDefinition.isAvailable(context.host); if (!availability.available) issues.push(error("release.target.unavailable", availability.reason ?? `Target ${target.id} is not available on this host.`, targetPath)); }
      if (producer.enabled && target.enabled) resolveProducerOutput(producer.id, target.id, targetPath);
    }
  }

  for (const [destinationIndex, destination] of config.destinations.entries()) {
    const destinationPath = `destinations.${destinationIndex}`;
    if (!destination.enabled) continue;
    const definition = registry.destinations.find((candidate) => candidate.id === destination.provider);
    if (!definition) { issues.push(error("release.destination.unknown", `Unknown destination provider: ${destination.provider}`, `${destinationPath}.provider`)); continue; }
    issues.push(...prefixIssues(definition.validate(destination, context), destinationPath));
    const enabledSlots = destination.slots.filter((slot) => slot.enabled);
    if (destination.enabled && enabledSlots.length === 0) issues.push(error("release.destination.slot.required", `Destination ${destination.id} must have an enabled slot.`, `${destinationPath}.slots`));
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled) continue;
      const slotPath = `${destinationPath}.slots.${slotIndex}`;
      const descriptor = isSourceRef(slot.input) ? source.output : resolveProducerOutput(slot.input.producerId, slot.input.outputId, `${slotPath}.input`);
      if (!descriptor) { report(error("release.destination.artifact.unknown", `Destination ${destination.id} references an unknown artifact.`, `${slotPath}.input`)); continue; }
      if (!matchesArtifact(descriptor, definition.accepts)) report(error("release.destination.input.incompatible", `Destination ${destination.id} cannot consume the selected artifact.`, slotPath));
    }
  }
  return issues;
};
