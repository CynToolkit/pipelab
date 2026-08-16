import { createNodeDefinition } from '@pipelab/plugin-core'
import { exportGodotAction } from './godot'
import { ExportGodotRunner } from './export'

export default createNodeDefinition({
  description: 'Godot',
  name: 'Godot',
  id: 'godot',
  icon: {
    type: 'icon',
    icon: 'mdi-gamepad-variant'
  },
  nodes: [
    {
      node: exportGodotAction,
      runner: ExportGodotRunner
    }
  ]
})
