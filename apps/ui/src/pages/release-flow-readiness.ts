import {
  outputDescriptor,
  type ReleaseHostCapabilities,
  type WorkflowConfigV2,
} from "@pipelab/shared";

type SavedConnection = {
  id: string;
  password?: string;
  username?: string;
  email?: string;
};

const text = (value: unknown) => String(value || "").trim();
const hasUnresolvedMigration = (config: Record<string, unknown>) =>
  Boolean((config.migration as { unresolved?: boolean } | undefined)?.unresolved);

export const getWorkflowReadiness = (
  workflow: WorkflowConfigV2 | undefined,
  capabilities: ReleaseHostCapabilities | undefined,
  connections: SavedConnection[],
  profileError = "",
): string[] => {
  if (!workflow) return [];

  const errors: string[] = [];
  const steamAccountReady = (id: unknown) => {
    const account = connections.find((connection) => connection.id === String(id));
    return !!(account?.password && (account.username || account.email));
  };

  if (!text(workflow.source.path)) errors.push("Choose a source");
  if (workflow.source.type === "construct3") {
    if (!text(workflow.source.profilePath)) errors.push("Choose a usable browser profile in Source settings");
    else if (profileError) errors.push(profileError);
  }
  if (!workflow.destinations.some((destination) => destination.enabled)) {
    errors.push("Enable at least one destination");
  }

  for (const destination of workflow.destinations) {
    if (!destination.enabled) continue;
    if (!destination.slots.length) errors.push(`Add a delivery slot to ${destination.serviceId}`);
    if (hasUnresolvedMigration(destination.config)) errors.push(`Resolve migrated ${destination.serviceId} slots`);

    if (destination.serviceId === "steam") {
      if (!destination.config.accountConnectionId || !steamAccountReady(destination.config.accountConnectionId)) {
        errors.push("Select a valid Steam account connection");
      }
      if (!text(destination.config.appId)) errors.push("Add a Steam App ID");
      if (destination.slots.some((slot) => !text(slot.config.depotId))) {
        errors.push("Add a Depot ID to every Steam depot");
      }
    }
    if (destination.serviceId === "itch") {
      if (!destination.config.accountConnectionId) errors.push("Select an Itch.io account connection");
      if (!text(destination.config.project)) errors.push("Add an Itch.io project");
      if (destination.slots.some((slot) => !text(slot.config.channel))) {
        errors.push("Add a channel to every Itch.io channel");
      }
    }
    if (destination.serviceId === "web-folder" && destination.slots.some((slot) => !text(slot.config.outputDir || destination.config.outputDir))) {
      errors.push("Add an output folder to every web folder");
    }
    if (destination.serviceId === "zip" && destination.slots.some((slot) => !text(slot.config.outputPath))) {
      errors.push("Choose a ZIP file path for every ZIP file");
    }

    for (const slot of destination.slots) {
      const packager = workflow.packagers.find((item) => item.id === slot.input.packagerId);
      const output = outputDescriptor(slot.input.outputId);
      const availability = capabilities?.packagers[packager?.definitionId || "electron"]?.targets.find(
        (target) => target.outputId === slot.input.outputId,
      );
      if (hasUnresolvedMigration(slot.config) || !packager || !packager.enabled || !output || !availability?.available) {
        errors.push(`Resolve ${destination.serviceId} delivery inputs`);
      }
    }
  }

  return [...new Set(errors)];
};
