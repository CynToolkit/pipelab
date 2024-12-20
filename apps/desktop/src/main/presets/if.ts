// @ts-nocheck
import { PresetFn, SavedFile } from '@@/model'

export const ifPreset: PresetFn = async () => {
  const branchId = 'branchId'
  const logOkId = 'logOkId'
  const logKoId = 'logKoId'
  const booleanId = 'booleanId'

  const data: SavedFile = {
    version: '1.0.0',
    name: 'Condition demo',
    description: 'Condition demo',
    variables: [
      {
        type: 'boolean',
        id: booleanId,
        description: 'The value of the conditon',
        name: 'Value',
        value: true
      }
    ],
    canvas: {
      blocks: [
        {
          type: 'condition',
          origin: {
            pluginId: 'system',
            nodeId: 'branch'
          },
          uid: branchId,
          params: {
            condition: ''
          },
          branchTrue: [
            {
              type: 'action',
              origin: {
                pluginId: 'system',
                nodeId: 'log'
              },
              uid: logOkId,
              params: {
                text: 'OK'
              }
            }
          ],
          branchFalse: [
            {
              type: 'action',
              origin: {
                pluginId: 'system',
                nodeId: 'log'
              },
              uid: logKoId,
              params: {
                text: 'KO'
              }
            }
          ]
        }
      ]
    }
  }

  return {
    data
  }
}
