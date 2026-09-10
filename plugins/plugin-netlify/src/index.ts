import { uploadToNetlify, uploadToNetlifyRunner } from "./publish";
import { buildNetlifySite, buildNetlifySiteRunner } from "./build";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  id: "@pipelab/plugin-netlify",
  packageName: "@pipelab/plugin-netlify",
  name: "Netlify",
  description: "Pipelab plugin for deploying web projects to Netlify",
  icon: { type: "icon", icon: "pi-cloud" },
  isOfficial: true,
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
