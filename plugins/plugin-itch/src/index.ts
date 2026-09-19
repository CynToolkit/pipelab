import { uploadToItch, uploadToItchRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

const itchDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-itch/destination",
  label: "Itch.io",
  accepts: { kind: ["application", "files"], container: ["directory", "archive"] },
  fields: [{ key: "accountConnectionId", type: "connection", integration: "@pipelab/plugin-itch", label: "Itch account", required: true }, { key: "project", type: "text", label: "Project", required: true }],
  slotFields: [{ key: "channel", type: "text", label: "Channel", required: true }],
  createDefaultConfig: () => ({ accountConnectionId: "", project: "" }),
  validate: (config) => [
    ...(!String(config.config.accountConnectionId || "").trim() ? [{ code: "itch.account.required", message: "An Itch account connection is required.", severity: "error" as const }] : []),
    ...(!String(config.config.project || "").trim() ? [{ code: "itch.project.required", message: "An Itch project is required.", severity: "error" as const }] : []),
    ...config.slots.filter((slot) => slot.enabled && !String(slot.config.channel || "").trim()).map((slot) => ({ code: "itch.channel.required", message: `A channel is required for slot ${slot.id}.`, severity: "error" as const, path: `slots.${slot.id}.config.channel` })),
  ],
  compile: (artifact, destination, slot) => [{ id: `itch-${destination.id}-${slot.id}`, uses: "@pipelab/plugin-itch/itch-upload", needs: [artifact.stepId], artifactInputs: { "input-folder": artifact }, with: { ...destination.config, ...slot.config }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }],
};

export default createNodeDefinition({
  id: "@pipelab/plugin-itch",
  packageName: "@pipelab/plugin-itch",
  name: "Itch.io",
  description: "Pipelab plugin for publishing games to itch.io",
  icon: { type: "icon", icon: "pi-palette" },
  isOfficial: true,
  nodes: [
    // make and package
    {
      node: uploadToItch,
      runner: uploadToItchRunner,
    },
  ],
  integrations: [
    {
      name: "Itch Butler Account",
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "password",
          placeholder: "API key",
        },
      ],
    },
  ],
  release: { destinations: [itchDestination] },
});
