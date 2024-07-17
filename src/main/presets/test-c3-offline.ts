import { PresetFn, SavedFile } from '@@/model'

export const testC3Offline: PresetFn = async () => {
  const packageWithElecton = 'electron-package-node'
  const steamUpload = 'steam-upload-node'

  const data: SavedFile = {
    version: '1.0.0',
    variables: [],
    name: 'C3 test without export',
    description: 'C3 test without export',
    canvas: {
      blocks: [
        {
          type: 'event',
          origin: {
            pluginId: 'system',
            nodeId: 'manual'
          },
          uid: 'manual-start',
          params: {}
        },
        {
          uid: packageWithElecton,
          type: 'action',
          origin: {
            nodeId: 'package-to-electron',
            pluginId: 'electron'
          },
          params: {
            'input-folder': `/home/quentin/Documents/Cyn Assets/app`,
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
            folder: `{{ steps['${packageWithElecton}']['outputs']['output'] }}`,
            appId: '3047200',
            depotId: '3047201',
            sdk: '/home/quentin/Documents/steamworkssdk/sdk',
            username: 'armaldio'
          }
        }
      ]
    }
  }

  return {
    data
  }
}
