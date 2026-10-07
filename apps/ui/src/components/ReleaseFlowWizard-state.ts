import { createReleaseConfig } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";

export interface ReleaseWizardDraft {
  name: string;
  source: ReleaseConfig["source"];
  destinations: ReleaseConfig["destinations"];
}

export type ReleaseWizardStep = "details" | "destinations" | "recap";

export const RELEASE_WIZARD_STEPS: ReleaseWizardStep[] = ["details", "destinations", "recap"];

export const createReleaseWizardDraft = (): ReleaseWizardDraft => ({
  name: "",
  source: { provider: "", config: {} },
  destinations: [],
});

export const releaseWizardNextStep = (step: ReleaseWizardStep): ReleaseWizardStep =>
  step === "details" ? "destinations" : "recap";

export const releaseWizardPreviousStep = (step: ReleaseWizardStep): ReleaseWizardStep =>
  step === "recap" ? "destinations" : "details";

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

export const releaseWizardCanReview = (draft: ReleaseWizardDraft, catalog: ReleaseCatalog) =>
  Boolean(draft.name.trim()) &&
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
): ReleaseConfig => ({
  ...createReleaseConfig({
    id: workflowId,
    project: projectId,
    name: draft.name.trim(),
    source: structuredClone(draft.source),
  }),
  destinations: structuredClone(draft.destinations),
});

export const releaseWizardRecap = (config: ReleaseConfig, catalog: ReleaseCatalog) => {
  const source = catalog.sources.find((candidate) => candidate.id === config.source.provider);
  const sourceDetails = (source?.fields || [])
    .filter((field) => !field.deferUntilEditor)
    .flatMap((field) => {
      const value = config.source.config[field.key];
      return value === undefined || value === "" || value === null
        ? []
        : [{ label: field.label, value: String(value) }];
    });

  return {
    name: config.name,
    sourceLabel: source?.label || config.source.provider,
    sourceDetails,
    destinationLabels: config.destinations.map(
      (destination) =>
        catalog.destinations.find((candidate) => candidate.id === destination.provider)?.label ||
        destination.provider,
    ),
  };
};
