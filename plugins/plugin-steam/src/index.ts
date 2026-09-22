import { uploadToSteam, uploadToSteamRunner } from "./upload-to-steam";
import { createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

export const steamDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-steam/destination",
  label: "Steam",
  accepts: { kind: "application", platform: ["windows", "linux", "macos"], container: "directory" },
  fields: [
    {
      key: "accountConnectionId",
      type: "connection",
      integration: "@pipelab/plugin-steam",
      label: "Steam account",
      required: true,
    },
    { key: "appId", type: "text", label: "Steam App ID", required: true },
    { key: "description", type: "text", label: "Build description" },
  ],
  slotFields: [{ key: "depotId", type: "text", label: "Depot ID", required: true }],
  createDefaultConfig: () => ({ accountConnectionId: "", appId: "", description: "" }),
  validate: (config) => [
    ...(!String(config.config.accountConnectionId || "").trim()
      ? [
          {
            code: "steam.account.required",
            message: "A Steam account connection is required.",
            severity: "error" as const,
            path: "config.accountConnectionId",
          },
        ]
      : []),
    ...(!String(config.config.appId || "").trim()
      ? [
          {
            code: "steam.app-id.required",
            message: "Steam App ID is required.",
            severity: "error" as const,
            path: "config.appId",
          },
        ]
      : []),
    ...config.slots
      .filter((slot) => slot.enabled && !String(slot.config.depotId || "").trim())
      .map((slot) => ({
        code: "steam.depot.required",
        message: `Depot ID is required for slot ${slot.id}.`,
        severity: "error" as const,
        path: `slots.${slot.id}.config.depotId`,
      })),
  ],
  compile: (artifact, destination, slot) => [
    {
      id: `steam-${destination.id}-${slot.id}`,
      uses: "@pipelab/plugin-steam/steam-upload",
      needs: [artifact.reference.stepId],
      artifactInputs: { folder: artifact.reference },
      with: { ...destination.config, ...slot.config },
      delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
    },
  ],
};

export default createNodeDefinition({
  id: "@pipelab/plugin-steam",
  packageName: "@pipelab/plugin-steam",
  name: "Steam",
  description: "Pipelab plugin for publishing games to Steam via SteamCMD",
  icon: { type: "icon", icon: "mdi-steam" },
  isOfficial: true,
  nodes: [
    {
      node: uploadToSteam,
      runner: uploadToSteamRunner,
    },
  ],
  integrations: [
    {
      name: "Steam Account",
      fields: [
        {
          key: "username",
          label: "Steam Username",
          type: "text",
          placeholder: "e.g., steam_user",
        },
        {
          key: "password",
          label: "Steam Password",
          type: "password",
          placeholder: "Steam password",
        },
      ],
    },
  ],
  release: { destinations: [steamDestination] },
});
