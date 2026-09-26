import { createReleaseConfig } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseConfig, ReleasePlan } from "@pipelab/shared";

export interface ReleaseWizardDraft {
  name: string;
  description: string;
  source: ReleaseConfig["source"];
  destinations: ReleaseConfig["destinations"];
}

export type ReleaseWizardResolutionState = "idle" | "resolving" | "ready" | "error";

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
