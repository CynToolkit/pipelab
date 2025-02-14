import { createAction, createActionRunner, createNumberParam, createPathParam, createStringParam } from '@pipelab/plugin-core'

export const props = createAction({
  id: 'electron:configure',
  description: 'Configure electron',
  displayString: "'Configure Electron'",
  icon: '',
  meta: {},
  name: 'Configure Electron',
  outputs: {
    configuration: {
      label: 'Configuration',
      value: {} as Partial<ElectronAppConfig.Config>
    }
  },
  params: {
    name: createStringParam('Pipelab', {
      label: 'Application name',
      description: 'The name of the application',
      required: true,
    }),
    appBundleId: createStringParam('com.pipelab.app', {
      label: 'Application bundle ID',
      description: 'The bundle ID of the application',
      required: true,
    }),
    appCopyright: createStringParam('Copyright © 2024 Pipelab', {
      label: 'Application copyright',
      description: 'The copyright of the application',
      required: false,
    }),
    appVersion: createStringParam('1.0.0', {
      label: 'Application version',
      description: 'The version of the application',
      required: true,
    }),
    icon: createPathParam('', {
      label: 'Application icon',
      description: 'The icon of the application',
      required: false,
      control: {
        type: 'path',
        options: {
          filters: [
            { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns'] }
          ]
        },
        label: 'Path to an image file'
      }
    }),
    author: createStringParam('Pipelab', {
      label: 'Application author',
      description: 'The author of the application',
      required: true,
    }),
    description: createStringParam('A simple Electron application', {
      label: 'Application description',
      description: 'The description of the application',
      required: false,
    }),

    appCategoryType: createStringParam('public.app-category.developer-tools', {
      platforms: ['darwin'],
      label: 'Application category type',
      description: 'The category type of the application',
      required: false,
    }),

    // window
    width: createNumberParam(800, {
      label: 'Window width',
      description: 'The width of the window',
      required: false,
    }),
    height: createNumberParam(600, {
      label: 'Window height',
      description: 'The height of the window',
      required: false,
    }),
    fullscreen: {
      label: 'Fullscreen',
      value: false,
      description: 'Whether to start the application in fullscreen mode',
      required: false,
      control: {
        type: 'boolean'
      }
    },
    frame: {
      label: 'Frame',
      value: true,
      description: 'Whether to show the window frame',
      required: false,
      control: {
        type: 'boolean'
      }
    },
    transparent: {
      label: 'Transparent',
      value: false,
      description: 'Whether to make the window transparent',
      required: false,
      control: {
        type: 'boolean'
      }
    },
    toolbar: {
      label: 'Toolbar',
      value: true,
      description: 'Whether to show the toolbar',
      required: false,
      control: {
        type: 'boolean'
      }
    },
    alwaysOnTop: {
      label: 'Always on top',
      value: false,
      description: 'Whether to always keep the window on top',
      required: false,
      control: {
        type: 'boolean'
      }
    },

    electronVersion: createStringParam('', {
      label: 'Electron version',
      description: 'The version of Electron to use',
      required: false,
    }),
    customMainCode: createPathParam('', {
      required: false,
      label: 'Custom main code',
      control: {
        type: 'path',
        options: {
          filters: [{ name: 'JavaScript', extensions: ['js'] }]
        },
        label: 'Path to a file containing custom main code'
      }
    }),
    disableAsarPackaging: {
      required: true,
      label: 'Disable ASAR packaging',
      value: true,
      control: {
        type: 'boolean'
      },
      description: 'Whether to disable packaging project files in a single binary or not'
    },
    enableExtraLogging: {
      required: true,
      label: 'Enable extra logging',
      value: false,
      control: {
        type: 'boolean'
      },
      description: 'Whether to enable extra logging of internal tools while bundling'
    },
    clearServiceWorkerOnBoot: {
      required: false,
      label: 'Clear service worker on boot',
      value: false,
      control: {
        type: 'boolean'
      },
      description: 'Whether to clear service worker on boot'
    },

    // Flags

    enableInProcessGPU: {
      required: false,
      label: 'Enable in-process GPU',
      value: false,
      control: {
        type: 'boolean'
      }
    },
    enableDisableRendererBackgrounding: {
      required: false,
      label: 'Disable renderer backgrounding',
      value: false,
      control: {
        type: 'boolean'
      }
    },
    forceHighPerformanceGpu: {
      required: false,
      label: 'Force high performance GPU',
      value: false,
      control: {
        type: 'boolean'
      }
    },

    // websocket apis
    websocketApi: {
      required: false,
      label: 'WebSocket APIs to allow (empty = all)',
      value: '[]',
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    },
    ignore: {
      required: false,
      label: 'Folders to ignore',
      description:
        'An array of string or Regex that allow ignoring certain files or folders from being packaged',
      value: `[
  // use 'src/app/' as starting point
]`,
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    },

    // integrations

    enableSteamSupport: {
      required: false,
      label: 'Enable steam support',
      description: 'Whether to enable Steam support',
      value: false,
      control: {
        type: 'boolean'
      }
    },
    steamGameId: createNumberParam(480, {
      required: false,
      label: 'Steam game ID',
      description: 'The Steam game ID',
    })
  }
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', inputs)
})
