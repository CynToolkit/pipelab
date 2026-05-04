import { uploadToPoki, uploadToPokiRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";
const icon = new URL("./assets/poki-icon.webp", import.meta.url).href;

export default createNodeDefinition({
  description: "Poki",
  name: "Poki",
  id: "poki",
  icon: {
    type: "image",
    image: icon,
  },
  nodes: [
    // make and package
    {
      node: uploadToPoki,
      runner: uploadToPokiRunner,
    },
  ],
});
