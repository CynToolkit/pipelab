import { uploadToNetlify, uploadToNetlifyRunner } from "./publish";
import { buildNetlifySite, buildNetlifySiteRunner } from "./build";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  nodes: [
    // make and package
    {
      node: buildNetlifySite,
      runner: buildNetlifySiteRunner,
    },
    {
      node: uploadToNetlify,
      runner: uploadToNetlifyRunner,
    },
  ],
  integrations: [
    {
      name: "Netlify Account",
      fields: [
        {
          key: "apiKey",
          label: "Personal Access Token",
          type: "password",
          placeholder: "netlify API token",
        },
      ],
    },
  ],
});
