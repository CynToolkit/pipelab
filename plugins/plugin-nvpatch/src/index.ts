import { NVPatch, NVPatchRunner } from "./nvpatch";

import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  id: "@pipelab/plugin-nvpatch",
  packageName: "@pipelab/plugin-nvpatch",
  name: "NVPatch",
  description: "Pipelab plugin for patching NW.js game exports",
  icon: { type: "icon", icon: "mdi-wrench" },
  isOfficial: true,
  nodes: [
    // make and package
    {
      node: NVPatch,
      runner: NVPatchRunner,
    },
  ],
});
