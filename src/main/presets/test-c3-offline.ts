import { PresetFn, SavedFile } from '@@/model'

export const testC3Offline: PresetFn = async () => {
  const packageWithElecton = 'electron-package-node'
  const steamUpload = 'steam-upload-node'

  const data: SavedFile = {
    version: '3.0.0',
    variables: [],
    name: 'C3 test without export',
    description: 'C3 test without export',
    canvas: {
      triggers: [
        {
          type: 'event',
          origin: {
            pluginId: 'system',
            nodeId: 'manual'
          },
          uid: 'manual-start',
          params: {}
        },
      ],
      blocks: [
        {
          uid: packageWithElecton,
          type: 'action',
          origin: {
            nodeId: 'package-to-electron',
            pluginId: 'electron'
          },
          params: {
            'input-folder':  {
              editor: 'editor',
              value: `/home/quentin/Documents/Cyn Assets/app`
            },
            arch: undefined,
            platform: undefined
          }
        },
        {
          uid: steamUpload,
          type: 'action',
          origin: {
            nodeId: 'steam-upload',
            pluginId: 'steam'
          },
          params: {
            folder: {
              editor: 'editor',
              value: `{{ steps['${packageWithElecton}']['outputs']['output'] }}`,
            },
            appId: {
              editor: 'editor',
              value: '3047200',
            },
            depotId: {
              editor: 'editor',
              value: '3047201',
            },
            sdk: {
              editor: 'editor',
              value: '/home/quentin/Documents/steamworkssdk/sdk',
            },
            username: {
              editor: 'editor',
              value: 'armaldio',
            },
          }
        }
      ]
    }
  }

  return {
    data
  }
}
