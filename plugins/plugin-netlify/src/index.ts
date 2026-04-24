import { uploadToNetlify, uploadToNetlifyRunner } from "./publish";
import { buildNetlifySite, buildNetlifySiteRunner } from "./build";

import { createNodeDefinition } from "@pipelab/plugin-core";
const icon = new URL("./assets/netlify-icon.webp", import.meta.url).href;

export default createNodeDefinition({
  description: "Netlify",
  name: "Netlify",
  id: "netlify",
  icon: {
    type: "image",
    image: icon,
  },
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
});
