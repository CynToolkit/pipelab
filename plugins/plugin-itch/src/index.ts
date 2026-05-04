import { uploadToItch, uploadToItchRunner } from "./export";

import { createNodeDefinition } from "@pipelab/plugin-core";
const icon = new URL("./assets/itch-icon.webp", import.meta.url).href;

export default createNodeDefinition({
  description: "Itch.io",
  name: "Itch.io",
  id: "itch.io",
  icon: {
    type: "image",
    image: icon,
  },
  nodes: [
    // make and package
    {
      node: uploadToItch,
      runner: uploadToItchRunner,
    },
  ],
});
