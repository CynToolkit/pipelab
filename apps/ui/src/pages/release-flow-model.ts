import { toRaw } from "vue";
import type {
  ReleaseBuildProfileConfig,
  ReleaseCatalog,
  ReleaseConfig,
  Connection,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseDestinationSlot,
  ReleaseCatalogTarget,
  Availability,
  ProducerInspection,
  ValidationIssue,
} from "@pipelab/shared";

export interface ReleaseOutputOption {
  value: string;
  label: string;
  ref: ReleaseOutputRef;
}

export type ReleaseOutputOwnerRef = { source: true } | { buildId: string };

export interface OutputReferenceConsumer {
  kind: "build" | "destination-slot";
  ownerId: string;
  label: string;
  path: string;
}

export type OutputReferenceChangeAction =
  | { kind: "source-provider"; oldProvider: string; newProvider: string }
  | { kind: "build-disable"; buildName: string }
  | { kind: "build-remove"; buildName: string }
  | {
      kind: "build-engine";
      buildName: string;
      newEngine: string;
      discardedSettings?: string[];
      disabledTargets?: string[];
    };

export interface CompatibleBuildCandidate {
  type: string;
  engine: string;
  target: string;
  typeLabel: string;
  engineLabel: string;
  targetLabel: string;
}

export const buildInputSelectionMode = (
  options: ReleaseOutputOption[],
  inputIssues: ValidationIssue[] = [],
) =>
  options.length === 0
    ? "missing"
    : options.length === 1 && inputIssues.length === 0
      ? "hidden"
      : "select";

export const buildInputControlVisible = (
  options: ReleaseOutputOption[],
  inputIssues: ValidationIssue[],
) => buildInputSelectionMode(options, inputIssues) !== "hidden";

export const releaseOutputRefValue = (ref?: ReleaseOutputRef) =>
  ref ? ("source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`) : "";

export const selectBuildInput = (
  build: ReleaseBuildProfileConfig,
  options: ReleaseOutputOption[],
  value: string,
) => {
  const output = options.find((candidate) => candidate.value === value);
  if (output) build.input = output.ref;
};

export const probeBuildInputCandidates = async (
  config: ReleaseConfig,
  buildId: string,
  candidates: ReleaseOutputOption[],
  planCandidate: (config: ReleaseConfig) => Promise<ReleasePlan | undefined>,
  shouldContinue: () => boolean = () => true,
) => {
  const buildIndex = config.builds.findIndex((build) => build.id === buildId);
  if (buildIndex < 0) return [];
  const options: ReleaseOutputOption[] = [];
  for (const option of candidates.filter(
    (candidate) => !("buildId" in candidate.ref && candidate.ref.buildId === buildId),
  )) {
    if (!shouldContinue()) break;
    const candidateConfig = structuredClone(toRaw(config));
    const candidateBuild = candidateConfig.builds.find((candidate) => candidate.id === buildId);
    if (!candidateBuild) continue;
    candidateBuild.input = structuredClone(toRaw(option.ref));
    const candidatePlan = await planCandidate(candidateConfig);
    if (!shouldContinue()) break;
    if (candidatePlan && plannerAcceptsBuildInput(candidatePlan, buildId, buildIndex))
      options.push(option);
  }
  return options;
};

export const createSerializedTaskQueue = (task: () => Promise<void>) => {
  let requested = false;
  let active: Promise<void> | undefined;

  const request = () => {
    requested = true;
    if (active) return active;
    active = (async () => {
      while (requested) {
        requested = false;
        await task();
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };

  return request;
};

export const runAfterSuccessfulSave = async <T>(
  save: () => Promise<void>,
  run: () => Promise<T>,
) => {
  await save();
  return run();
};

export const buildTypesFor = (catalog: ReleaseCatalog) => catalog.buildTypes;

export const buildEnginesFor = (catalog: ReleaseCatalog, type: string) =>
  catalog.producers.filter(
    (producer) =>
      producer.planning.mode === "build" &&
      producer.targets.some((target) => target.buildType === type),
  );

export const buildTargetsFor = (catalog: ReleaseCatalog, engine: string, type: string) =>
  catalog.producers
    .find((producer) => producer.id === engine)
    ?.targets.filter((target) => target.buildType === type) ?? [];

export const buildTargetIsAvailable = (target: ReleaseCatalogTarget) =>
  target.availability?.available !== false;

export const buildTargetAvailabilityReason = (target: ReleaseCatalogTarget) =>
  target.availability?.available === false
    ? target.availability.reason || "Unavailable on this device."
    : undefined;

export const buildProfileSummary = (catalog: ReleaseCatalog, build: ReleaseBuildProfileConfig) => {
  const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
  const targets = producer?.targets
    .filter((target) => target.buildType === build.type)
    .filter((target) =>
      build.targets.some((selected) => selected.id === target.id && selected.enabled),
    )
    .map((target) => target.label);
  return {
    engineLabel: producer?.label || build.engine,
    targetLabels: targets || [],
  };
};

export const createBuildProfile = (
  catalog: ReleaseCatalog,
  type: string,
  engine: string,
  id: string,
  preferredTargets?: string[],
): ReleaseBuildProfileConfig | undefined => {
  const producer = buildEnginesFor(catalog, type).find((candidate) => candidate.id === engine);
  if (!producer) return undefined;
  const targets = buildTargetsFor(catalog, engine, type);
  return {
    id,
    type,
    engine,
    enabled: true,
    config: { ...producer.defaultConfig },
    targets: targets.map((target) => ({
      id: target.id,
      enabled: Boolean(preferredTargets?.includes(target.id)) && buildTargetIsAvailable(target),
      config: { ...target.defaultConfig },
    })),
  };
};

export const removeBuildProfile = (config: ReleaseConfig, id: string): boolean => {
  const nextBuilds = config.builds.filter((build) => build.id !== id);
  if (nextBuilds.length === config.builds.length) return false;
  config.builds = nextBuilds;
  return true;
};

export const setBuildTargetEnabled = (
  build: ReleaseBuildProfileConfig,
  id: string,
  enabled: boolean,
  availability?: Availability,
): boolean => {
  const target = build.targets.find((candidate) => candidate.id === id);
  if (!target) return false;
  if (enabled && availability?.available === false) return false;
  target.enabled = enabled;
  return true;
};

export const switchBuildProfileEngine = (
  catalog: ReleaseCatalog,
  build: ReleaseBuildProfileConfig,
  engine: string,
): ReleaseBuildProfileConfig | undefined => {
  const producer = catalog.producers.find((candidate) => candidate.id === engine);
  if (!producer || producer.planning.mode !== "build") return undefined;
  const previousTargets = new Map(build.targets.map((target) => [target.id, target]));
  return {
    ...build,
    engine,
    config: Object.fromEntries(
      Object.keys(producer.defaultConfig).map((key) => [
        key,
        build.config[key] ?? producer.defaultConfig[key],
      ]),
    ),
    targets: producer.targets
      .filter((target) => target.buildType === build.type)
      .map((target) => ({
        id: target.id,
        enabled: false,
        config: Object.fromEntries(
          Object.keys(target.defaultConfig).map((key) => [
            key,
            previousTargets.get(target.id)?.config[key] ?? target.defaultConfig[key],
          ]),
        ),
      })),
  };
};

const referenceMatchesOwner = (ref: ReleaseOutputRef | undefined, owner: ReleaseOutputOwnerRef) =>
  Boolean(
    ref &&
    ("source" in owner ? "source" in ref : "buildId" in ref && ref.buildId === owner.buildId),
  );

const buildConsumerLabel = (build: ReleaseBuildProfileConfig, catalog?: ReleaseCatalog) =>
  build.name?.trim() ||
  `${catalog?.buildTypes.find((type) => type.id === build.type)?.label || build.type} build`;

export const outputReferenceConsumers = (
  config: ReleaseConfig,
  owner: ReleaseOutputOwnerRef,
  catalog?: ReleaseCatalog,
): OutputReferenceConsumer[] => {
  const consumers: OutputReferenceConsumer[] = [];
  config.builds.forEach((build, index) => {
    if (referenceMatchesOwner(build.input, owner))
      consumers.push({
        kind: "build",
        ownerId: build.id,
        label: buildConsumerLabel(build, catalog),
        path: `builds.${index}.input`,
      });
  });
  config.destinations.forEach((destination, destinationIndex) => {
    const destinationLabel =
      catalog?.destinations.find((item) => item.id === destination.provider)?.label ||
      destination.provider;
    destination.slots.forEach((slot, slotIndex) => {
      if (!referenceMatchesOwner(slot.input, owner)) return;
      consumers.push({
        kind: "destination-slot",
        ownerId: slot.id,
        label: `${destinationLabel} · ${deploymentSlotLabel(slot, slotIndex)}`,
        path: `destinations.${destinationIndex}.slots.${slotIndex}.input`,
      });
    });
  });
  return consumers;
};

export const outputReferenceChangeImpact = (
  action: OutputReferenceChangeAction,
  consumers: OutputReferenceConsumer[],
) => {
  const consumerLabels = consumers.map((consumer) => consumer.label).join(", ");
  if (action.kind === "build-remove")
    return {
      confirmationRequired: true,
      message: consumerLabels
        ? `Removing “${action.buildName}” will leave these inputs pointing at a removed build: ${consumerLabels}. References will stay in place; update them manually.`
        : `Removing “${action.buildName}” will delete its build configuration.`,
    };
  if (action.kind === "build-engine") {
    const changes: string[] = [];
    if (action.discardedSettings?.length)
      changes.push(
        `Settings no longer supported by ${action.newEngine} will be discarded: ${action.discardedSettings.join(", ")}.`,
      );
    if (action.disabledTargets?.length)
      changes.push(
        `Previously selected targets will be disabled: ${action.disabledTargets.join(", ")}.`,
      );
    if (consumerLabels)
      changes.push(
        `Outputs used by ${consumerLabels} may change. Their references will stay in place; review compatibility after the change.`,
      );
    return changes.length
      ? {
          confirmationRequired: true,
          message: `Changing “${action.buildName}” to ${action.newEngine}. ${changes.join(" ")}`,
        }
      : { confirmationRequired: false };
  }
  if (!consumers.length) return { confirmationRequired: false };
  if (action.kind === "source-provider")
    return {
      confirmationRequired: true,
      message: `Changing the source provider from “${action.oldProvider}” to “${action.newProvider}” affects source outputs used by: ${consumerLabels}. Their references will stay set to Source; review compatibility after the change.`,
    };
  if (action.kind === "build-disable")
    return {
      confirmationRequired: true,
      message: `Disabling “${action.buildName}” will leave the selected output unavailable to ${consumerLabels}. Its output reference will stay in place; update it manually if needed.`,
    };
  return { confirmationRequired: false };
};

export const issuesForPath = (issues: ValidationIssue[], path: string) =>
  issues.filter((issue) => issue.path === path || issue.path?.startsWith(`${path}.`));

export const deduplicateValidationIssues = (issues: ValidationIssue[]) => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.code, issue.path || "", issue.message, issue.severity]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const releaseCanRun = (
  flow: ReleaseConfig | undefined,
  plan: ReleasePlan | undefined,
  issues: ValidationIssue[],
  running: boolean,
  planning: boolean,
  saveState: "saving" | "saved" | "error" = "saved",
) =>
  Boolean(
    flow &&
    plan &&
    !running &&
    !planning &&
    saveState !== "error" &&
    !issues.some((issue) => issue.severity === "error"),
  );

export const deploymentSlotLabel = (slot: ReleaseDestinationSlot, index: number) =>
  slot.name?.trim() || `Deployment ${index + 1}`;

export const readinessLabel = (enabled: boolean, configured: boolean, hasIssues: boolean) => {
  if (!enabled) return "Disabled";
  return configured && !hasIssues ? "Ready" : "Needs attention";
};

export const applyProducerInspection = (
  build: ReleaseBuildProfileConfig,
  buildIndex: number,
  inspection: ProducerInspection,
  options: { applyFieldValues?: boolean } = {},
) => {
  for (const [key, value] of Object.entries(
    options.applyFieldValues === false ? {} : inspection.fieldValues || {},
  )) {
    const targetMatch = key.match(/^targets\.([^.]+)\.config\.(.+)$/);
    if (targetMatch) {
      const target = build.targets.find((candidate) => candidate.id === targetMatch[1]);
      if (target) target.config[targetMatch[2]] = value;
      continue;
    }
    build.config[key.replace(/^config\./, "")] = value;
  }
  const issues = (inspection.issues || []).map((issue) => {
    const targetMatch = issue.path?.match(/^targets\.([^.]+)(?:\.(.*))?$/);
    if (!targetMatch)
      return {
        ...issue,
        path: issue.path ? `builds.${buildIndex}.${issue.path}` : `builds.${buildIndex}`,
      };
    const targetIndex = build.targets.findIndex((target) => target.id === targetMatch[1]);
    return {
      ...issue,
      path:
        targetIndex >= 0
          ? `builds.${buildIndex}.targets.${targetIndex}${targetMatch[2] ? `.${targetMatch[2]}` : ""}`
          : `builds.${buildIndex}`,
    };
  });
  return { options: inspection.fieldOptions || {}, issues };
};

export const plannerAcceptsBuildCandidate = (
  plan: ReleasePlan,
  candidateId: string,
  buildIndex: number,
  destinationIndex: number,
  slotIndex: number,
) => {
  const buildPath = `builds.${buildIndex}`;
  const slotPath = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
  return (
    plan.producers.some((producer) => producer.id === candidateId) &&
    !plan.issues.some(
      (issue) =>
        issue.severity === "error" &&
        (issue.path === buildPath ||
          issue.path?.startsWith(`${buildPath}.`) ||
          issue.path === slotPath ||
          issue.path?.startsWith(`${slotPath}.`)),
    )
  );
};

export const probeCompatibleBuildCandidates = async (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
  destinationId: string,
  slotId: string,
  planCandidate: (config: ReleaseConfig) => Promise<ReleasePlan | undefined>,
  shouldContinue: () => boolean = () => true,
): Promise<CompatibleBuildCandidate[]> => {
  const destinationIndex = config.destinations.findIndex(
    (destination) => destination.id === destinationId,
  );
  if (destinationIndex < 0) return [];
  const slotIndex = config.destinations[destinationIndex].slots.findIndex(
    (slot) => slot.id === slotId,
  );
  if (slotIndex < 0) return [];

  const candidates: CompatibleBuildCandidate[] = [];
  let candidateNumber = 0;
  for (const buildType of catalog.buildTypes) {
    for (const engine of buildEnginesFor(catalog, buildType.id)) {
      for (const target of buildTargetsFor(catalog, engine.id, buildType.id)) {
        if (!shouldContinue()) return candidates;
        if (!buildTargetIsAvailable(target)) continue;

        let candidateId = `__compatible-build-${candidateNumber++}`;
        while (config.builds.some((build) => build.id === candidateId))
          candidateId = `__compatible-build-${candidateNumber++}`;
        const candidate = createBuildProfile(catalog, buildType.id, engine.id, candidateId, [
          target.id,
        ]);
        if (!candidate) continue;

        const candidateConfig = structuredClone(toRaw(config));
        candidateConfig.builds.push(candidate);
        candidateConfig.destinations[destinationIndex].slots[slotIndex].input = {
          buildId: candidate.id,
          targetId: target.id,
        };
        const plan = await planCandidate(candidateConfig);
        if (!shouldContinue()) return candidates;
        if (
          plan &&
          plannerAcceptsBuildCandidate(
            plan,
            candidate.id,
            candidateConfig.builds.length - 1,
            destinationIndex,
            slotIndex,
          )
        )
          candidates.push({
            type: buildType.id,
            engine: engine.id,
            target: target.id,
            typeLabel: buildType.label,
            engineLabel: engine.label,
            targetLabel: target.label,
          });
      }
    }
  }
  return candidates;
};

export const connectionMatchesIntegration = (connection: Connection, integration?: string) =>
  !integration ||
  connection.pluginName === integration ||
  connection.integrationName === integration;

const outputKey = (ref: ReleaseOutputRef) =>
  "source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`;

const outputLabel = (config: ReleaseConfig, catalog: ReleaseCatalog, ref: ReleaseOutputRef) => {
  if ("source" in ref) {
    return `Source — ${catalog.sources.find((source) => source.id === config.source.provider)?.label ?? config.source.provider}`;
  }
  const build = config.builds.find((candidate) => candidate.id === ref.buildId);
  const producer = catalog.producers.find((candidate) => candidate.id === build?.engine);
  const target = producer?.targets.find((candidate) => candidate.id === ref.targetId);
  return `${build?.name || producer?.label || build?.engine || ref.buildId} — ${target?.label || ref.targetId}`;
};

export const planOutputOptions = (
  config: ReleaseConfig,
  plan: ReleasePlan,
  catalog: ReleaseCatalog,
): ReleaseOutputOption[] =>
  plan.outputs.map((output) => ({
    value: outputKey(output.ref),
    label: outputLabel(config, catalog, output.ref),
    ref: output.ref,
  }));

export const plannerAcceptsBuildInput = (plan: ReleasePlan, buildId: string, buildIndex: number) =>
  plan.producers.some((producer) => producer.id === buildId) &&
  !plan.issues.some(
    (issue) =>
      issue.severity === "error" &&
      issue.path === `builds.${buildIndex}.input` &&
      issue.code.startsWith("release.build.input."),
  );
