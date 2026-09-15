import { minifyCode, minifyCodeRunner } from "./code";
import { minifyImages, minifyImagesRunner } from "./images";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  id: "@pipelab/plugin-minify",
  packageName: "@pipelab/plugin-minify",
  name: "Minifyer",
  description: "Pipelab plugin for minifying HTML, CSS, and JavaScript assets",
  icon: { type: "icon", icon: "mdi-zip-box" },
  isOfficial: true,
  nodes: [
    // make and package
    {
      node: minifyCode,
      runner: minifyCodeRunner,
    },
    {
      node: minifyImages,
      runner: minifyImagesRunner,
    },
  ],
});
