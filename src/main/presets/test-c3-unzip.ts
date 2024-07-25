import { PresetFn, SavedFile } from '@@/model'
import { ExportParams } from '@cyn/plugin-construct'

export const testC3Unzip: PresetFn = async () => {
  const exportConstructProjectId = 'export-construct-project'
  const unzipFileId = 'unzip-file-node'
  const packageWithElecton = 'electron-package-node'
  const steamUpload = 'steam-upload-node'

  const data: SavedFile = {
    version: '2.0.0',
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
        },
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
            file: `'/home/armaldio/Téléchargements/test.c3p'`,
            username: "\"a\"",
            password: "\"a\"",
            version: '\"395\"',
            headless: true
          } satisfies ExportParams
        },
        {
          uid: unzipFileId,
          type: 'action',
          origin: {
            nodeId: 'unzip-file-node',
            pluginId: 'filesystem'
          },
          params: {
            file: `steps['${exportConstructProjectId}']['outputs']['folder']`
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
            'input-folder': `steps['${unzipFileId}']['outputs']['output']`,
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
            folder: `steps['${packageWithElecton}']['outputs']['output']`,
            appId: "'3047200'",
            depotId: "'3047201'",
            sdk: "'/home/armaldio/Documents/steamworkssdk/sdk'",
            username: "'armaldio'"
          }
        }
      ]
    }
  }

  return {
    data
  }
}
