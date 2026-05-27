import { minifyCode, minifyCodeRunner } from "./code";
import { minifyImages, minifyImagesRunner } from "./images";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
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
