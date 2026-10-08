import { createReleaseConfig } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";

export interface ReleaseWizardDraft {
  name: string;
  description: string;
  source: ReleaseConfig["source"];
  builds: ReleaseConfig["builds"];
  destinations: ReleaseConfig["destinations"];
}

export type ReleaseWizardStep = "details" | "source" | "builds" | "destinations" | "recap";

export const RELEASE_WIZARD_STEPS: ReleaseWizardStep[] = [
  "details",
  "source",
  "destinations",
  "recap",
];
export const HOSTED_RELEASE_WIZARD_STEPS: ReleaseWizardStep[] = [
  "details",
  "source",
  "builds",
  "destinations",
  "recap",
];

export const createReleaseWizardDraft = (): ReleaseWizardDraft => ({
  name: "",
  description: "",
  source: { provider: "", config: {} },
  builds: [],
  destinations: [],
});

export const releaseWizardNextStep = (
  step: ReleaseWizardStep,
  steps: ReleaseWizardStep[] = RELEASE_WIZARD_STEPS,
): ReleaseWizardStep => {
  const currentIndex = steps.indexOf(step);
  return steps[Math.min(currentIndex + 1, steps.length - 1)];
};

export const releaseWizardPreviousStep = (
  step: ReleaseWizardStep,
  steps: ReleaseWizardStep[] = RELEASE_WIZARD_STEPS,
): ReleaseWizardStep => {
  const currentIndex = steps.indexOf(step);
  return steps[Math.max(currentIndex - 1, 0)];
};

export const releaseWizardCanContinueDetails = (draft: ReleaseWizardDraft) =>
  Boolean(draft.name.trim());

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

export const releaseWizardHasSource = (
  source: ReleaseConfig["source"],
  catalog: ReleaseCatalog,
) => {
  return Boolean(
    source.provider && catalog.sources.some((candidate) => candidate.id === source.provider),
  );
};

export const releaseWizardCanReview = (draft: ReleaseWizardDraft, catalog: ReleaseCatalog) =>
  releaseWizardCanContinueDetails(draft) &&
  releaseWizardSourceIsReady(draft.source, catalog) &&
  draft.destinations.length > 0;

export const releaseWizardDestination = (
  provider: string,
  catalog: ReleaseCatalog,
): ReleaseConfig["destinations"][number] | undefined => {
  const definition = catalog.destinations.find((item) => item.id === provider);
  if (!definition) return undefined;
  return {
    id: provider,
    provider,
    enabled: true,
    config: structuredClone(definition.defaultConfig),
    // Leave the output unrouted for the editor. Choosing an output here would be a guess.
    slots: [{ id: "output", enabled: true, config: {} }],
  };
};

export const buildReleaseWizardConfig = (
  draft: ReleaseWizardDraft,
  projectId: string,
  workflowId: string,
): ReleaseConfig => {
  const config = createReleaseConfig({
    id: workflowId,
    project: projectId,
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    source: structuredClone(draft.source),
  });
  return {
    ...config,
    builds: structuredClone(draft.builds),
    destinations: structuredClone(draft.destinations),
  };
};

export const releaseWizardRecap = (draft: ReleaseWizardDraft, catalog: ReleaseCatalog) => {
  const source = catalog.sources.find((candidate) => candidate.id === draft.source.provider);
  const pathField = source?.fields?.find(
    (field) => !field.deferUntilEditor && (field.type === "file" || field.type === "directory"),
  );
  const sourcePath = pathField ? String(draft.source.config[pathField.key] || "") : "";

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    sourceLabel: source?.label || draft.source.provider,
    sourceIcon: source?.icon,
    sourcePath,
    destinations: draft.destinations.map((destination) => {
      const definition = catalog.destinations.find(
        (candidate) => candidate.id === destination.provider,
      );
      return {
        provider: destination.provider,
        label: definition?.label || destination.provider,
        icon: definition?.icon,
      };
    }),
  };
};
