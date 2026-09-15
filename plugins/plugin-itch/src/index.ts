import { uploadToItch, uploadToItchRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
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
