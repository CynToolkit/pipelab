import { PresetFn, SavedFile } from '@@/model'

export const moreToCome: PresetFn = async () => {
  const startId = 'manual-start'

  const data: SavedFile = {
    version: '3.0.0',
    name: 'More to come!',
    description: 'Do not hesitate to suggest templates you would see here',
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
    disabled: true,
    hightlight: false
  }
}
