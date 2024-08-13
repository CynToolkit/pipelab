import { createAction, createActionRunner } from '@cyn/plugin-core'
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
      value: {} as ElectronConfiguration
    }
  },
  params: {
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
    enableSteamSupport: {
      required: false,
      label: 'Enable steam support',
      value: false,
      control: {
        type: 'boolean'
      }
    }
  }
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', {
    electronVersion: inputs.electronVersion,
    steamSupport: inputs.enableSteamSupport,
    customMainCode: inputs.customMainCode,
  })
})
