// @ts-nocheck

import { PresetFn, SavedFile } from '@@/model'

export const loopPreset: PresetFn = async () => {
  const forId = 'forId'
  const arrayId = 'arrayId'

  const logStepId = 'logStepId'
  const logExitId = 'logExitId'

  const data: SavedFile = {
    version: '1.0.0',
    name: 'Loop demo',
    description: 'Loop demo',
    variables: [
      {
        id: arrayId,
        description: 'An array',
        name: 'Array',
        type: 'array',
        of: 'string',
        value: []
      }
    ],
    canvas: {
      blocks: [
        {
          type: 'loop',
          origin: {
            pluginId: 'system',
            nodeId: 'for'
          },

          params: {},
          children: [
            {
              type: 'action',
              origin: {
                pluginId: 'system',
                nodeId: 'log'
              },
              params: {},
              uid: logStepId
            }
          ],
          uid: forId
        },
        {
          type: 'action',
          origin: {
            pluginId: 'system',
            nodeId: 'log'
          },
          params: {},
          uid: logExitId
        }
      ]
    }
  }

  return {
    data
  }
}
