import { PresetFn, SavedFile } from '@@/model'

export const c3toSteamPreset: PresetFn = async () => {
  const startId = 'manual-start'

  const data: SavedFile = {
    version: '3.0.0',
    name: 'Construct 3 to Steam',
    description: 'A basic project to get you started with Construct 3 and Steam',
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
        {
          uid: '3oHbOKmCXo6NSjmrn0tHG',
          type: 'action',
          origin: {
            nodeId: 'export-construct-project',
            pluginId: 'construct'
          },
          params: {
            file: {
              editor: 'simple',
              value: ''
            },
            username: {
              editor: 'simple',
              value: '""'
            },
            password: {
              editor: 'simple',
              value: '""'
            },
            version: {
              editor: 'simple',
              value: ''
            },
            headless: {
              editor: 'simple',
              value: 'true'
            },
            timeout: {
              editor: 'simple',
              value: '120'
            },
            customProfile: {
              editor: 'simple',
              value: ''
            }
          }
        },
        {
          uid: '6s1uYWDi2XbRriBpvQSBS',
          type: 'action',
          origin: {
            nodeId: 'unzip-file-node',
            pluginId: 'filesystem'
          },
          params: {
            file: {
              editor: 'editor',
              value: "steps['3oHbOKmCXo6NSjmrn0tHG']['outputs']['zipFile']"
            }
          }
        },
        {
          uid: 'cvxzwBfXPZhH1RbmmxBdG',
          type: 'action',
          origin: {
            nodeId: 'electron:package:v2',
            pluginId: 'electron'
          },
          params: {
            arch: {
              editor: 'simple',
              value: ''
            },
            platform: {
              editor: 'simple',
              value: ''
            },
            'input-folder': {
              editor: 'editor',
              value: "steps['6s1uYWDi2XbRriBpvQSBS']['outputs']['output']"
            },
            name: {
              editor: 'simple',
              value: '"Pipelab"'
            },
            appBundleId: {
              editor: 'simple',
              value: '"com.pipelab.app"'
            },
            appCopyright: {
              editor: 'simple',
              value: '"Copyright © 2024 Pipelab"'
            },
            appVersion: {
              editor: 'simple',
              value: '"1.0.0"'
            },
            icon: {
              editor: 'simple',
              value: ''
            },
            author: {
              editor: 'simple',
              value: '"Pipelab"'
            },
            description: {
              editor: 'simple',
              value: '"A sample application"'
            },
            appCategoryType: {
              editor: 'simple',
              value: '"public.app-category.developer-tools"'
            },
            width: {
              editor: 'simple',
              value: 800
            },
            height: {
              editor: 'simple',
              value: 600
            },
            fullscreen: {
              editor: 'simple',
              value: 'false'
            },
            frame: {
              editor: 'simple',
              value: 'true'
            },
            transparent: {
              editor: 'simple',
              value: 'false'
            },
            toolbar: {
              editor: 'simple',
              value: 'true'
            },
            alwaysOnTop: {
              editor: 'simple',
              value: 'false'
            },
            electronVersion: {
              editor: 'simple',
              value: '""'
            },
            customMainCode: {
              editor: 'simple',
              value: ''
            },
            disableAsarPackaging: {
              editor: 'simple',
              value: 'true'
            },
            enableExtraLogging: {
              editor: 'simple',
              value: 'false'
            },
            clearServiceWorkerOnBoot: {
              editor: 'simple',
              value: 'false'
            },
            enableInProcessGPU: {
              editor: 'simple',
              value: 'false'
            },
            enableDisableRendererBackgrounding: {
              editor: 'simple',
              value: 'false'
            },
            forceHighPerformanceGpu: {
              editor: 'simple',
              value: 'false'
            },
            websocketApi: {
              editor: 'simple',
              value: '[]'
            },
            ignore: {
              editor: 'simple',
              value: "[\n  // use 'src/app/' as starting point\n]"
            },
            enableSteamSupport: {
              editor: 'simple',
              value: 'true'
            },
            steamGameId: {
              editor: 'simple',
              value: '480'
            }
          }
        },
        {
          uid: '1pJrNARroFnuY9DfiC56r',
          type: 'action',
          origin: {
            nodeId: 'steam-upload',
            pluginId: 'steam'
          },
          params: {
            sdk: {
              editor: 'simple',
              value: ''
            },
            username: {
              editor: 'simple',
              value: ''
            },
            appId: {
              editor: 'simple',
              value: ''
            },
            depotId: {
              editor: 'simple',
              value: ''
            },
            description: {
              editor: 'simple',
              value: ''
            },
            folder: {
              editor: 'editor',
              value: "steps['cvxzwBfXPZhH1RbmmxBdG']['outputs']['output']"
            },
            enableDRM: {
              editor: 'simple',
              value: 'false'
            },
            binaryToPatch: {
              editor: 'simple',
              value: ''
            }
          },
          disabled: false
        },
        {
          uid: 'gnTsA6oO49ySfetxUf-0K',
          type: 'action',
          origin: {
            nodeId: 'fs:open-in-explorer',
            pluginId: 'filesystem'
          },
          params: {
            path: {
              editor: 'editor',
              value: "steps['cvxzwBfXPZhH1RbmmxBdG']['outputs']['output']"
            }
          },
          disabled: false
        }
      ]
    }
  }

  return {
    data,
    hightlight: true
  }
}
