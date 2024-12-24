import { createNodeDefinition } from '@plugins/plugin-core'
import { exportAction, ExportActionRunner } from './export-c3p.js'
import { exportProjectAction, ExportProjectActionRunner } from './export-project.js'
import icon from './assets/construct.webp'
import { constructVersionValidator } from './export-shared'

export default createNodeDefinition({
  description: 'Construct',
  name: 'Construct',
  id: 'construct',
  icon: {
    type: 'image',
    image: icon
  },
  nodes: [
    {
      node: exportAction,
      runner: ExportActionRunner
    },
    {
      node: exportProjectAction,
      runner: ExportProjectActionRunner
    }
  ],
  validators: [
    // {
    //   id: 'construct-version',
    //   description: 'Version must be a valid semver',
    //   validator: constructVersionValidator
    // }
  ]
})

export type { Params as ExportParams } from './export-c3p.js'
