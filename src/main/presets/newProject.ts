import { PresetFn, SavedFile } from '@@/model'

export const newProjectPreset: PresetFn = async () => {
  const startId = 'manual-start'

  const data: SavedFile = {
    version: '3.0.0',
    name: 'New project',
    description: 'New project',
    variables: [],
    canvas: {
      triggers: [
        {
          type: 'event',
          origin: {
            pluginId: 'system',
            nodeId: 'manual'
          },
          uid: startId,
          params: {}
        }
      ],
      blocks: [

      ]
    }
  }

  return {
    data,
    hightlight: true
  }
}
