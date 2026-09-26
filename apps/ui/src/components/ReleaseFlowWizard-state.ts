import { reactive } from "vue";
import { createReleaseConfig } from "@pipelab/shared";
import type {
  ReleaseCatalog,
  ReleaseConfig,
  ReleaseFieldOption,
  ReleasePlan,
  ValidationIssue,
} from "@pipelab/shared";

export interface ReleaseWizardDraft {
  name: string;
  description: string;
  source: ReleaseConfig["source"];
  destinations: ReleaseConfig["destinations"];
}

export type ReleaseWizardResolutionState = "idle" | "resolving" | "ready" | "error";
export type ReleaseWizardSourceInspectionStatus = "idle" | "checking" | "ready" | "error";

export interface ReleaseWizardSourceInspectionState {
  status: ReleaseWizardSourceInspectionStatus;
  error: string;
  fieldOptions: Record<string, ReleaseFieldOption[]>;
  issues: ValidationIssue[];
}

export interface ReleaseWizardSourceInspectionResult {
  fieldOptions?: Record<string, ReleaseFieldOption[]>;
  issues?: ValidationIssue[];
}

export const createReleaseWizardDraft = (): ReleaseWizardDraft => ({
  name: "",
  description: "",
  source: { provider: "", config: {} },
  destinations: [],
});

export const buildReleaseWizardConfig = (
  draft: ReleaseWizardDraft,
  projectId: string,
  workflowId: string,
): ReleaseConfig => ({
  ...createReleaseConfig({
    id: workflowId,
    project: projectId,
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    source: structuredClone(draft.source),
  }),
  destinations: structuredClone(draft.destinations),
});

export const releaseWizardSourceIsReady = (
  source: ReleaseConfig["source"],
  catalog: ReleaseCatalog,
) => {
  if (!source.provider) return false;
  const definition = catalog.sources.find((candidate) => candidate.id === source.provider);
  if (!definition) return false;
  return (definition.fields?.filter((field) => !field.deferUntilEditor) || []).every(
    (field) => !field.required || String(source.config[field.key] || "").trim(),
  );
};

export const releaseWizardSourceCanContinue = (
  sourceIsReady: boolean,
  inspection: ReleaseWizardSourceInspectionState,
) =>
  sourceIsReady &&
  inspection.status === "ready" &&
  !inspection.issues.some((issue) => issue.severity === "error");

export const releaseWizardSourceFieldIssues = (issues: ValidationIssue[], fieldKey: string) => {
  const prefixes = [
    fieldKey,
    `config.${fieldKey}`,
    `source.${fieldKey}`,
    `source.config.${fieldKey}`,
  ];
  return issues.filter((issue) =>
    prefixes.some((prefix) => issue.path === prefix || issue.path?.startsWith(`${prefix}.`)),
  );
};

export const releaseWizardBuildSummaries = (config: ReleaseConfig, catalog: ReleaseCatalog) =>
  config.builds.map((build) => {
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    const targets = build.targets
      .filter((target) => target.enabled)
      .map(
        (target) =>
          producer?.targets.find((candidate) => candidate.id === target.id)?.label || target.id,
      );
    return `Build · ${producer?.label || build.engine} · ${targets.join(", ") || "No target selected"}`;
  });

export const releaseWizardNeedsAdditionalBuildSetup = (config: ReleaseConfig) =>
  config.destinations.some(
    (destination) =>
      destination.enabled && destination.slots.some((slot) => slot.enabled && !slot.input),
  );

export const releaseWizardCreationConfig = (
  state: ReleaseWizardResolutionState,
  config: ReleaseConfig | undefined,
) => (state === "ready" && config ? structuredClone(config) : undefined);

const hasBlockingIssue = (plan: ReleasePlan, path: string) =>
  plan.issues.some(
    (issue) =>
      issue.severity === "error" && (issue.path === path || issue.path?.startsWith(`${path}.`)),
  );

export const releaseWizardResolutionIsPlannerValid = (config: ReleaseConfig, plan: ReleasePlan) => {
  for (const build of config.builds) {
    if (!build.enabled) continue;
    const buildIndex = config.builds.indexOf(build);
    if (
      !plan.producers.some((producer) => producer.id === build.id) ||
      hasBlockingIssue(plan, `builds.${buildIndex}`)
    )
      return false;
  }

  for (const [destinationIndex, destination] of config.destinations.entries()) {
    if (!destination.enabled) continue;
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled || !slot.input) continue;
      const issuePath = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
      if (hasBlockingIssue(plan, issuePath)) return false;

      const plannedSlot = plan.destinations
        .find((candidate) => candidate.id === destination.id)
        ?.slots.find((candidate) => candidate.id === slot.id);
      if (!plannedSlot?.input) return false;

      if ("source" in slot.input) {
        if (!("source" in plannedSlot.input)) return false;
      } else if (
        !(
          "producerId" in plannedSlot.input &&
          plannedSlot.input.producerId === slot.input.buildId &&
          plannedSlot.input.outputId === slot.input.targetId
        )
      )
        return false;
    }
  }
  return true;
};

export const createWizardRequestRevision = () => {
  let revision = 0;
  return {
    next: () => ++revision,
    invalidate: () => ++revision,
    isCurrent: (requestId: number) => revision === requestId,
  };
};

export const createWizardSourceInspection = (
  inspect: (source: ReleaseConfig["source"]) => Promise<ReleaseWizardSourceInspectionResult>,
  debounceMs = 250,
) => {
  const state = reactive<ReleaseWizardSourceInspectionState>({
    status: "idle",
    error: "",
    fieldOptions: {},
    issues: [],
  });
  const requests = createWizardRequestRevision();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const clearResult = () => {
    state.error = "";
    state.fieldOptions = {};
    state.issues = [];
  };
  const run = async (source: ReleaseConfig["source"], requestId: number) => {
    state.status = "checking";
    clearResult();
    try {
      const result = await inspect(structuredClone(source));
      if (!requests.isCurrent(requestId)) return;
      state.fieldOptions = result.fieldOptions || {};
      state.issues = result.issues || [];
      state.status = "ready";
    } catch (cause) {
      if (!requests.isCurrent(requestId)) return;
      state.error = cause instanceof Error ? cause.message : String(cause);
      state.status = "error";
    }
  };
  const inspectNow = (source: ReleaseConfig["source"]) => {
    clearTimer();
    const requestId = requests.next();
    return run(source, requestId);
  };
  const schedule = (source: ReleaseConfig["source"]) => {
    clearTimer();
    const requestId = requests.next();
    const snapshot = structuredClone(source);
    state.status = "checking";
    clearResult();
    timer = setTimeout(() => {
      if (requests.isCurrent(requestId)) void run(snapshot, requestId);
    }, debounceMs);
  };
  const invalidate = () => {
    clearTimer();
    requests.invalidate();
    state.status = "idle";
    clearResult();
  };

  return { state, inspectNow, schedule, invalidate };
};
