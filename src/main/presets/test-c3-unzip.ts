import { PresetFn, SavedFile } from '@@/model'

export const testC3Unzip: PresetFn = async () => {
  const exportConstructProjectId = 'export-construct-project'
  const unzipFileId = 'unzip-file-node'
  const packageWithElecton = 'electron-package-node'
  const steamUpload = 'steam-upload-node'

  const data: SavedFile = {
    version: '3.0.0',
    name: 'From Construct to Steam',
    description: 'Export from Construct, package with Electron, then upload to Steam',
    variables: [],
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
        }
      ],
      blocks: [
        {
          uid: exportConstructProjectId,
          type: 'action',
          origin: {
            nodeId: 'export-construct-project',
            pluginId: 'construct'
          },
          params: {
            file: {
              editor: 'editor',
              value: `'/home/armaldio/Téléchargements/test.c3p'`
            },
            username: {
              editor: 'editor',
              value: '"a"'
            },
            password: {
              editor: 'editor',
              value: '"a"'
            },
            version: {
              editor: 'editor',
              value: '"395"'
            },
            headless: {
              editor: 'editor',
              value: true
            }
          }
        },
        {
          uid: unzipFileId,
          type: 'action',
          origin: {
            nodeId: 'unzip-file-node',
            pluginId: 'filesystem'
          },
          params: {
            file: {
              editor: 'editor',
              value: `steps['${exportConstructProjectId}']['outputs']['folder']`
            }
          }
        },
        {
          uid: packageWithElecton,
          type: 'action',
          origin: {
            nodeId: 'electron:package',
            pluginId: 'electron'
          },
          params: {
            'input-folder': {
              editor: 'editor',
              value: `steps['${unzipFileId}']['outputs']['output']`
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
              value: `steps['${packageWithElecton}']['outputs']['output']`
            },
            appId: {
              editor: 'editor',
              value: "'3047200'"
            },
            depotId: {
              editor: 'editor',
              value: "'3047201'"
            },
            sdk: {
              editor: 'editor',
              value: "'/home/armaldio/Documents/steamworkssdk/sdk'"
            },
            username: {
              editor: 'editor',
              value: "'armaldio'"
            }
          }
        }
      ]
    }
  }

  return {
    data
  }
}
