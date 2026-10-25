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
  ReleaseFieldDefinition,
} from "@pipelab/shared";
import {
  releaseWorkflowConnectionAliases,
  releaseDestinationLocalName,
  suggestWorkflowConnectionAlias,
} from "../utils/release-connection-bindings";

export { invalidEnvironmentBindingPaths } from "../utils/environment-bindings";

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

export const suggestMissingConnectionAliases = (
  values: Record<string, unknown>,
  fields: ReleaseFieldDefinition[] | undefined,
  usedAliases: Set<string>,
) => {
  for (const field of fields || []) {
    if (field.type !== "connection" || field.required === false) continue;
    const current = values[field.key];
    if (typeof current === "string" && current.trim()) continue;
    const alias = suggestWorkflowConnectionAlias(field.label || field.key, [...usedAliases]);
    values[field.key] = alias;
    usedAliases.add(alias);
  }
};

export const createReleaseSourceConfig = (
  flow: ReleaseConfig,
  source: ReleaseCatalog["sources"][number],
  catalog: ReleaseCatalog,
) => {
  const config = structuredClone(toRaw(source.defaultConfig));
  const usedAliases = new Set(releaseWorkflowConnectionAliases(flow, catalog));
  suggestMissingConnectionAliases(config, source.fields, usedAliases);
  return config;
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
  selectedInput?: ReleaseOutputRef,
) =>
  buildInputSelectionMode(options, inputIssues) !== "hidden" ||
  Boolean(
    selectedInput &&
    !options.some((option) => option.value === releaseOutputRefValue(selectedInput)),
  );

export const appendReleaseDestinationInstance = (
  flow: ReleaseConfig,
  definition: ReleaseCatalog["destinations"][number],
  createId: () => string,
  catalog?: ReleaseCatalog,
) => {
  const usedAliases = new Set(catalog ? releaseWorkflowConnectionAliases(flow, catalog) : []);
  const sameProviderDestinations = flow.destinations.filter(
    (candidate) => candidate.provider === definition.id,
  );
  const usedNames = new Set(
    sameProviderDestinations.map((candidate) =>
      releaseDestinationLocalName(candidate, flow.destinations),
    ),
  );
  let destinationNumber = 1;
  while (usedNames.has(`Destination ${destinationNumber}`)) destinationNumber += 1;
  const destination: ReleaseConfig["destinations"][number] = {
    id: createId(),
    provider: definition.id,
    name: `Destination ${destinationNumber}`,
    enabled: true,
    config: structuredClone(toRaw(definition.defaultConfig)),
    slots: [{ id: createId(), name: "Deployment 1", enabled: true, config: {} }],
  };
  suggestMissingConnectionAliases(destination.config, definition.fields, usedAliases);
  for (const slot of destination.slots)
    suggestMissingConnectionAliases(slot.config, definition.slotFields, usedAliases);
  flow.destinations.push(destination);
  return destination;
};

export const releaseOutputRefValue = (ref?: ReleaseOutputRef) =>
  ref ? ("source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`) : "";

export const compatibleBuildInputLabel = (
  options: ReleaseOutputOption[],
  selectedInput?: ReleaseOutputRef,
) => {
  if (selectedInput) {
    return options.find((option) => option.value === releaseOutputRefValue(selectedInput))?.label;
  }
  return options.length === 1 ? options[0].label : undefined;
};

export const missingRequiredFieldIssues = (config: ReleaseConfig, catalog: ReleaseCatalog) => {
  const issues: ValidationIssue[] = [];
  const hasConfiguredValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(hasConfiguredValue);
    if (typeof value === "object")
      return Object.values(value as Record<string, unknown>).some(hasConfiguredValue);
    return true;
  };
  const addMissingFields = (
    fields: ReleaseCatalog["sources"][number]["fields"],
    values: Record<string, unknown>,
    prefix: string,
  ) => {
    for (const field of fields || []) {
      if (!field.required) continue;
      if (hasConfiguredValue(values[field.key])) continue;
      issues.push({
        code: "release.field.required",
        message: `${field.label} is required.`,
        severity: "error",
        path: `${prefix}.${field.key}`,
      });
    }
  };

  const source = catalog.sources.find((candidate) => candidate.id === config.source.provider);
  if (source) addMissingFields(source.fields, config.source.config, "source.config");

  config.builds.forEach((build, buildIndex) => {
    if (!build.enabled) return;
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    if (!producer) return;
    addMissingFields(producer.fields, build.config, `builds.${buildIndex}.config`);
    build.targets.forEach((target, targetIndex) => {
      if (!target.enabled) return;
      const definition = producer.targets.find((candidate) => candidate.id === target.id);
      if (definition)
        addMissingFields(
          definition.fields,
          target.config,
          `builds.${buildIndex}.targets.${targetIndex}.config`,
        );
    });
  });

  config.destinations.forEach((destination, destinationIndex) => {
    if (!destination.enabled) return;
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    if (!definition) return;
    addMissingFields(
      definition.fields,
      destination.config,
      `destinations.${destinationIndex}.config`,
    );
    destination.slots.forEach((slot, slotIndex) => {
      if (!slot.enabled) return;
      addMissingFields(
        definition.slotFields,
        slot.config,
        `destinations.${destinationIndex}.slots.${slotIndex}.config`,
      );
    });
  });
  return issues;
};

export const shouldInspectReleaseProviderConfig = (config: unknown) => {
  const containsEnvironmentReference = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsEnvironmentReference);
    if (typeof value === "object" && value !== null)
      return Object.values(value).some(containsEnvironmentReference);
    if (typeof value !== "string") return false;
    return [...value.matchAll(/\$\{\{([^{}]+)\}\}/g)].some((match) =>
      match[1].trim().startsWith("env."),
    );
  };

  return !containsEnvironmentReference(config);
};

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
  target.availabilityStatus !== "unknown" && target.availability?.available !== false;

export const buildTargetAvailabilityReason = (target: ReleaseCatalogTarget) =>
  target.availabilityStatus === "unknown"
    ? "Requires agent to check availability."
    : target.availability?.available === false
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
  existingAliases: string[] = [],
): ReleaseBuildProfileConfig | undefined => {
  const producer = buildEnginesFor(catalog, type).find((candidate) => candidate.id === engine);
  if (!producer) return undefined;
  const usedAliases = new Set(existingAliases);
  const config = { ...producer.defaultConfig };
  suggestMissingConnectionAliases(config, producer.fields, usedAliases);
  const targets = buildTargetsFor(catalog, engine, type);
  return {
    id,
    type,
    engine,
    enabled: true,
    config,
    targets: targets.map((target) => {
      const enabled =
        Boolean(preferredTargets?.includes(target.id)) && buildTargetIsAvailable(target);
      const targetConfig = { ...target.defaultConfig };
      if (enabled) suggestMissingConnectionAliases(targetConfig, target.fields, usedAliases);
      return { id: target.id, enabled, config: targetConfig };
    }),
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
  availabilityStatus?: "unknown",
  fields?: ReleaseFieldDefinition[],
  existingAliases: readonly string[] = [],
): boolean => {
  const target = build.targets.find((candidate) => candidate.id === id);
  if (!target) return false;
  if (enabled && (availability?.available === false || availabilityStatus === "unknown"))
    return false;
  if (enabled) suggestMissingConnectionAliases(target.config, fields, new Set(existingAliases));
  target.enabled = enabled;
  return true;
};

export const switchBuildProfileEngine = (
  catalog: ReleaseCatalog,
  build: ReleaseBuildProfileConfig,
  engine: string,
  existingAliases: readonly string[] = [],
): ReleaseBuildProfileConfig | undefined => {
  const producer = catalog.producers.find((candidate) => candidate.id === engine);
  if (!producer || producer.planning.mode !== "build") return undefined;
  const previousProducer = catalog.producers.find((candidate) => candidate.id === build.engine);
  const previousTargets = new Map(build.targets.map((target) => [target.id, target]));
  const config = { ...producer.defaultConfig, ...build.config };
  const usedAliases = new Set(existingAliases);
  for (const field of producer.fields || []) {
    if (field.type !== "connection") continue;
    const previousField = previousProducer?.fields?.find(
      (candidate) => candidate.key === field.key,
    );
    if (previousField?.type !== "connection" || previousField.integration !== field.integration)
      config[field.key] = "";
  }
  suggestMissingConnectionAliases(config, producer.fields, usedAliases);
  return {
    ...build,
    engine,
    config,
    targets: producer.targets
      .filter((target) => target.buildType === build.type)
      .map((target) => {
        const previousTarget = previousTargets.get(target.id);
        const previousDefinition = previousProducer?.targets.find(
          (candidate) => candidate.id === target.id,
        );
        const targetConfig = { ...target.defaultConfig, ...previousTarget?.config };
        for (const field of target.fields || []) {
          if (field.type !== "connection") continue;
          const previousField = previousDefinition?.fields?.find(
            (candidate) => candidate.key === field.key,
          );
          if (
            previousField?.type !== "connection" ||
            previousField.integration !== field.integration
          )
            targetConfig[field.key] = "";
        }
        suggestMissingConnectionAliases(targetConfig, target.fields, usedAliases);
        return { id: target.id, enabled: false, config: targetConfig };
      }),
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
  otherChecksPending = false,
  hasReadinessError = false,
  hasInvalidFormInput = false,
) =>
  Boolean(
    flow &&
    plan &&
    !running &&
    !planning &&
    !otherChecksPending &&
    !hasReadinessError &&
    !hasInvalidFormInput &&
    saveState !== "error" &&
    !issues.some((issue) => issue.severity === "error"),
  );

export const deploymentSlotLabel = (slot: ReleaseDestinationSlot, index: number) =>
  slot.name?.trim() || `Deployment ${index + 1}`;

export const readinessLabel = (enabled: boolean, configured: boolean, hasIssues: boolean) => {
  if (!enabled) return "Disabled";
  return configured && !hasIssues ? "Ready" : "Needs attention";
};

export type ReleaseRepairRoute = "connections" | "builds" | "configuration" | "issues";

export const firstBlockingIssue = (issues: ValidationIssue[]) =>
  issues.find((issue) => issue.severity === "error");

export const clampBlockerIndex = (index: number, blockerCount: number) =>
  blockerCount === 0 ? 0 : Math.min(Math.max(index, 0), blockerCount - 1);

export const blockerAtIndex = (blockers: ValidationIssue[], index: number) =>
  blockers[clampBlockerIndex(index, blockers.length)];

export const releaseRepairRoute = (issue: ValidationIssue): ReleaseRepairRoute => {
  if (
    issue.path?.startsWith("builds.") ||
    /^destinations\.\d+\.slots\.\d+\.input(?:\.|$)/.test(issue.path || "")
  )
    return "builds";
  if (issue.path?.startsWith("source") || issue.path?.startsWith("destinations"))
    return "configuration";
  if (issue.code.startsWith("release.connection.")) return "connections";
  return "issues";
};

export interface ReleaseBlockerContext {
  targetLabel?: string;
  destinationLabel?: string;
  connectionLabel?: string;
  connectionFieldLabel?: string;
  hasMatchingConnection?: boolean;
}

export const releaseBlockerPresentation = (
  issue: ValidationIssue,
  context: ReleaseBlockerContext = {},
) => {
  const route = releaseRepairRoute(issue);
  const connectionLabel = context.connectionLabel;
  const configureLabel = context.destinationLabel || context.targetLabel;
  const connectionAction = connectionLabel
    ? context.hasMatchingConnection
      ? `Select ${connectionLabel} connection`
      : `Add ${connectionLabel} connection`
    : undefined;
  const title = connectionLabel
    ? `Connect your ${connectionLabel} ${context.connectionFieldLabel || "account"}`
    : route === "builds"
      ? `Configure ${context.targetLabel || "build"}`
      : route === "configuration"
        ? `Configure ${configureLabel || "release"}`
        : route === "connections"
          ? "Manage connections"
          : "Resolve workflow issue";

  return {
    title,
    description: issue.message,
    actionLabel:
      connectionAction ||
      (route === "builds"
        ? "Configure build"
        : route === "configuration"
          ? `Configure ${configureLabel || "release"}`
          : route === "connections"
            ? "Manage connections"
            : "Review issues"),
  };
};

export interface ReleaseReadinessInput {
  loading: boolean;
  inspectingSource: boolean;
  planning: boolean;
  hasPlan: boolean;
  hasReadinessError: boolean;
  blockingIssueCount: number;
  invalidFieldCount?: number;
}

export const releaseReadinessState = (readiness: ReleaseReadinessInput) =>
  readiness.hasReadinessError
    ? "error"
    : readiness.blockingIssueCount || readiness.invalidFieldCount
      ? "attention"
      : readiness.loading || readiness.inspectingSource || readiness.planning || !readiness.hasPlan
        ? "checking"
        : "ready";

export const dashboardShipIntentAction = (options: {
  intent: boolean;
  workflowMatchesRoute: boolean;
  loading: boolean;
  readiness: ReturnType<typeof releaseReadinessState>;
  canShip: boolean;
}) => {
  if (!options.intent || !options.workflowMatchesRoute || options.loading) return "wait" as const;
  if (options.readiness === "checking") return "wait" as const;
  return options.readiness === "ready" && options.canShip
    ? ("ship" as const)
    : ("blocked" as const);
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

export const plannedBuildInputLabel = (
  config: ReleaseConfig,
  plan: ReleasePlan | undefined,
  catalog: ReleaseCatalog,
  buildId: string,
) => {
  const build = config.builds.find((candidate) => candidate.id === buildId);
  const plannedInput = plan?.producers.find((producer) => producer.id === buildId)?.input;
  const input =
    build?.input ??
    (plannedInput &&
      ("source" in plannedInput
        ? { source: true as const }
        : { buildId: plannedInput.producerId, targetId: plannedInput.outputId }));
  if (!input) return undefined;
  if ("buildId" in input && input.buildId.startsWith("__auto__"))
    return "Automatic conversion output";
  return outputLabel(config, catalog, input);
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
