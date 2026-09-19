import { uploadToSteam, uploadToSteamRunner } from "./upload-to-steam";
import { createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

const steamDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-steam/destination",
  label: "Steam",
  accepts: { kind: "application", platform: ["windows", "linux", "macos"] },
  createDefaultConfig: () => ({ accountConnectionId: "", appId: "" }),
  validate: (config) => !String(config.config.appId || "").trim() ? [{ code: "steam.app-id.required", message: "Steam App ID is required.", severity: "error" }] : [],
  compile: (artifact, destination, slot) => [{ id: `steam-${destination.id}-${slot.id}`, uses: "@pipelab/plugin-steam/steam-upload", needs: [artifact.stepId], with: { ...destination.config, ...slot.config }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }],
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
