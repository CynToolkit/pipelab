import { createReleaseConfig } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseCatalogTarget, ReleaseConfig } from "@pipelab/shared";
import { suggestMissingConnectionAliases } from "../pages/release-flow-model";
import { releaseWorkflowConnectionAliases } from "../utils/release-connection-bindings";

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

const releaseConfigForDraft = (draft: ReleaseWizardDraft): ReleaseConfig => ({
  ...createReleaseConfig({
    id: "wizard-draft",
    project: "wizard-project",
    name: draft.name || "Draft",
    source: draft.source,
  }),
  builds: draft.builds,
  destinations: draft.destinations,
});

export const suggestReleaseWizardConnectionAliases = (
  draft: ReleaseWizardDraft,
  catalog: ReleaseCatalog,
) => {
  const usedAliases = new Set(releaseWorkflowConnectionAliases(releaseConfigForDraft(draft), catalog));
  const source = catalog.sources.find((candidate) => candidate.id === draft.source.provider);
  suggestMissingConnectionAliases(draft.source.config, source?.fields, usedAliases);
  for (const build of draft.builds) {
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    suggestMissingConnectionAliases(build.config, producer?.fields, usedAliases);
    for (const target of build.targets) {
      const targetDefinition = producer?.targets.find((candidate) => candidate.id === target.id);
      suggestMissingConnectionAliases(target.config, targetDefinition?.fields, usedAliases);
    }
  }
  for (const destination of draft.destinations) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    suggestMissingConnectionAliases(destination.config, definition?.fields, usedAliases);
    for (const slot of destination.slots)
      suggestMissingConnectionAliases(slot.config, definition?.slotFields, usedAliases);
  }
  return draft;
};

export const chooseReleaseWizardSource = (
  draft: ReleaseWizardDraft,
  provider: string,
  catalog: ReleaseCatalog,
) => {
  const definition = catalog.sources.find((source) => source.id === provider);
  if (!definition) return draft;
  draft.source = {
    provider,
    config: structuredClone(definition.defaultConfig),
  };
  return suggestReleaseWizardConnectionAliases(draft, catalog);
};

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

export const releaseWizardCanCreate = (state: {
  isReady: boolean;
  projectId?: string;
  canContinueDestinations: boolean;
  createPending: boolean;
  invalidEnvironmentBindingCount: number;
}) =>
  Boolean(
    state.isReady &&
    state.projectId &&
    state.canContinueDestinations &&
    !state.createPending &&
    state.invalidEnvironmentBindingCount === 0,
  );

export const releaseWizardIsOfflineBrowserDraft = (isBrowser: boolean, agentReady: boolean) =>
  isBrowser && !agentReady;

export const releaseWizardTargetAvailability = (
  target: ReleaseCatalogTarget,
  agentReady: boolean,
) => {
  if (!agentReady || target.availabilityStatus === "unknown")
    return "Availability: Unknown (agent required)";
  if (target.availability?.available === false)
    return `Unavailable: ${target.availability.reason || "not supported on this device"}`;
  if (target.availability?.available === true) return "Available on this device";
  return "No host availability check required";
};

export const releaseWizardDestination = (
  provider: string,
  catalog: ReleaseCatalog,
  draft: ReleaseWizardDraft = createReleaseWizardDraft(),
): ReleaseConfig["destinations"][number] | undefined => {
  const definition = catalog.destinations.find((item) => item.id === provider);
  if (!definition) return undefined;
  const destination: ReleaseConfig["destinations"][number] = {
    id: provider,
    provider,
    enabled: true,
    config: structuredClone(definition.defaultConfig),
    // Leave the output unrouted for the editor. Choosing an output here would be a guess.
    slots: [{ id: "output", enabled: true, config: {} }],
  };
  const usedAliases = new Set(releaseWorkflowConnectionAliases(releaseConfigForDraft(draft), catalog));
  suggestMissingConnectionAliases(destination.config, definition.fields, usedAliases);
  for (const slot of destination.slots)
    suggestMissingConnectionAliases(slot.config, definition.slotFields, usedAliases);
  return destination;
};

export const buildReleaseWizardConfig = (
  draft: ReleaseWizardDraft,
  projectId: string,
  workflowId: string,
  catalog?: ReleaseCatalog,
): ReleaseConfig => {
  const savedDraft = structuredClone(draft);
  if (catalog) suggestReleaseWizardConnectionAliases(savedDraft, catalog);
  const config = createReleaseConfig({
    id: workflowId,
    project: projectId,
    name: savedDraft.name.trim(),
    description: savedDraft.description.trim() || undefined,
    source: structuredClone(savedDraft.source),
  });
  return {
    ...config,
    builds: structuredClone(savedDraft.builds),
    destinations: structuredClone(savedDraft.destinations),
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
