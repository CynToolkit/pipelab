import { uploadToItch, uploadToItchRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

const itchDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-itch/destination",
  label: "Itch.io",
  accepts: { kind: ["application", "archive"] },
  createDefaultConfig: () => ({ accountConnectionId: "", project: "" }),
  validate: () => [],
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
