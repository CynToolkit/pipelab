import { createAction, createActionRunner } from '@pipelab/plugin-core'
import { configureParams } from './forge'

export const props = createAction({
  id: 'electron:configure',
  description: 'Configure electron',
  displayString: "'Configure Electron'",
  icon: '',
  meta: {},
  name: 'Configure Electron',
  advanced: true,
  outputs: {
    configuration: {
      label: 'Configuration',
      value: {} as Partial<DesktopApp.Electron>
    }
  },
  params: configureParams
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', inputs)
})
