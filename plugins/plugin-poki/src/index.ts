import { uploadToPoki, uploadToPokiRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";

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
});
