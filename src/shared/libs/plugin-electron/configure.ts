import { createAction, createActionRunner } from '@pipelab/plugin-core'
import { configureParams } from './forge'

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
  params: configureParams
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', inputs)
})
