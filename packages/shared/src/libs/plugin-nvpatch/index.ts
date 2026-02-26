import { NVPatch, NVPatchRunner } from './nvpatch'

import { createNodeDefinition } from '@pipelab/plugin-core'

export default createNodeDefinition({
  description: 'NVPatch',
  name: 'NVPatch',
  id: 'nv-patch',
  icon: {
    type: 'icon',
    icon: 'mdi-wrench'
  },
  nodes: [
    // make and package
    {
      node: NVPatch,
      runner: NVPatchRunner
    }
  ]
})
