import { PresetFn, SavedFile } from '@@/model'

export const newProjectPreset: PresetFn = async () => {
  const startId = 'manual-start'

  const data: SavedFile = {
    version: '1.0.0',
    name: 'New project',
    description: 'New project',
    variables: [],
    canvas: {
      blocks: [
        {
          type: 'event',
          origin: {
            pluginId: 'system',
            nodeId: 'manual'
          },
          uid: startId,
          params: {}
        }
      ]
    }
  }

  return {
    data
  }
}
