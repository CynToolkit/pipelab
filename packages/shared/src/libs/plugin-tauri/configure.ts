import { createAction, createActionRunner } from '@pipelab/plugin-core'
import { configureParams } from './tauri'

export const props = createAction({
  id: 'tauri:configure',
  description: 'Configure tauri',
  displayString: "'Configure Tauri'",
  icon: '',
  meta: {},
  name: 'Configure Tauri',
  advanced: true,
  outputs: {
    configuration: {
      label: 'Configuration',
      value: {} as Partial<DesktopApp.Tauri>
    }
  },
  params: configureParams
})

export const configureRunner = createActionRunner<typeof props>(async ({ setOutput, inputs }) => {
  setOutput('configuration', inputs)
})
