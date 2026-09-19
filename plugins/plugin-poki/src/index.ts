import { uploadToPoki, uploadToPokiRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

const pokiDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-poki/destination",
  label: "Poki",
  accepts: { kind: "application", platform: "web", container: "directory" },
  fields: [{ key: "project", type: "text", label: "Poki project", required: true }, { key: "name", type: "text", label: "Version name", required: true }, { key: "notes", type: "text", label: "Release notes", required: true }],
  createDefaultConfig: () => ({ project: "", name: "", notes: "" }),
  validate: (config) => ["project", "name", "notes"].filter((key) => !String(config.config[key] || "").trim()).map((key) => ({ code: `poki.${key}.required`, message: `Poki ${key} is required.`, severity: "error" as const, path: `config.${key}` })),
  compile: (artifact, destination, slot) => [{ id: `poki-${destination.id}-${slot.id}`, uses: "@pipelab/plugin-poki/poki-upload", needs: [artifact.stepId], artifactInputs: { "input-folder": artifact }, with: { ...destination.config, ...slot.config }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }],
};

export default createNodeDefinition({
  id: "@pipelab/plugin-poki",
  packageName: "@pipelab/plugin-poki",
  name: "Poki",
  description: "Pipelab plugin for publishing HTML5 games to Poki",
  icon: { type: "icon", icon: "pi-globe" },
  isOfficial: true,
  nodes: [
    // make and package
    {
      node: uploadToPoki,
      runner: uploadToPokiRunner,
    },
  ],
  integrations: [
    {
      name: "Poki Developer Profile",
      fields: [
        {
          key: "gameId",
          label: "Game ID",
          type: "text",
          placeholder: "e.g., poki-game-id",
        },
        {
          key: "apiKey",
          label: "Developer Token",
          type: "password",
          placeholder: "Poki Developer Token",
        },
      ],
    },
  ],
  release: { destinations: [pokiDestination] },
});
