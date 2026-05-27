import { NVPatch, NVPatchRunner } from "./nvpatch";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  nodes: [
    // make and package
    {
      node: NVPatch,
      runner: NVPatchRunner,
    },
  ],
});
