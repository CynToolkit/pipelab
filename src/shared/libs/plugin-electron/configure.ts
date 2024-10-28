import { createAction, createActionRunner } from '@pipelab/plugin-core'
import { ElectronConfiguration } from './model'

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
      value: {} as Partial<ElectronConfiguration>
    }
  },
  params: {
    name: {
      label: 'Application name',
      value: 'Pipelab',
      description: 'The name of the application',
      required: true,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    appBundleId: {
      label: 'Application bundle ID',
      value: 'com.pipelab.app',
      description: 'The bundle ID of the application',
      required: true,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    appCopyright: {
      label: 'Application copyright',
      value: 'Copyright © 2024 Pipelab',
      description: 'The copyright of the application',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    appVersion: {
      label: 'Application version',
      value: '1.0.0',
      description: 'The version of the application',
      required: true,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    icon: {
      label: 'Application icon',
      value: '',
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
    },
    author: {
      label: 'Application author',
      value: 'Pipelab',
      description: 'The author of the application',
      required: true,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    description: {
      label: 'Application description',
      value: 'A simple Electron application',
      description: 'The description of the application',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },

    appCategoryType: {
      platforms: ['darwin'],
      label: 'Application category type',
      value: 'public.app-category.developer-tools',
      description: 'The category type of the application',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },

    // window
    width: {
      label: 'Window width',
      value: 800,
      description: 'The width of the window',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'number'
        }
      }
    },
    height: {
      label: 'Window height',
      value: 600,
      description: 'The height of the window',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'number'
        }
      }
    },
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

    electronVersion: {
      value: '',
      label: 'Electron version',
      description: 'The version of Electron to use',
      required: false,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    customMainCode: {
      required: false,
      label: 'Custom main code',
      value: '',
      control: {
        type: 'path',
        options: {
          filters: [{ name: 'JavaScript', extensions: ['js'] }]
        },
        label: 'Path to a file containing custom main code'
      }
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

    // websocket api
    websocketApi: {
      required: false,
      label: 'WebSocket APIs to allow (empty = all)',
      value: [],
      control: {
        type: 'array',
        options: {
          kind: 'text'
        }
      }
    }

    // integrations

    // enableSteamSupport: {
    //   required: false,
    //   label: 'Enable steam support',
    //   value: false,
    //   control: {
    //     type: 'boolean'
    //   }
    // }
  }
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', inputs)
})
