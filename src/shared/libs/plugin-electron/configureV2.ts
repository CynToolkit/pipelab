import { createAction, createActionRunner } from '@pipelab/plugin-core'

export const propsConfigureV2 = createAction({
  id: 'electron:configure:v2',
  description: 'Configure electron (v2)',
  displayString: "'Configure Electron'",
  icon: '',
  meta: {},
  name: 'Configure Electron (v2)',
  outputs: {
    configuration: {
      label: 'Configuration',
      value: {} as ElectronAppConfig.Config
    }
  },
  params: {
    configuration: {
      label: 'Configuration',
      value: {} as ElectronAppConfig.Config,
      description: 'The configuration of Electron',
      control: {
        type: 'electron:configure:v2'
      }
    }
  }
})

export const configureV2Runner = createActionRunner<typeof propsConfigureV2>(
  async ({ setOutput, inputs }) => {
    setOutput('configuration', inputs.configuration)
  }
)
