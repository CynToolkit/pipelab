import { uploadToItch, uploadToItchRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";

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
          label: "Butler API Key",
          type: "password",
          placeholder: "butler API key",
        },
      ],
    },
  ],
});
