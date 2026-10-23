import { PresetFn, SavedFile } from '@@/model'

export const newProjectPreset: PresetFn = async () => {
  const startId = 'manual-start'

  const data: SavedFile = {
    version: '4.0.0',
    type: 'default',
    name: 'Empty project',
    description: 'A default project with no tasks added',
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
    hightlight: true,
  }
}
