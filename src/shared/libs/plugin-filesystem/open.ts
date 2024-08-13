import { createAction, createActionRunner } from '@cyn/plugin-core'
// import displayString from './displayStringRun.lua?raw'

export const ID = 'fs:open-in-explorer'

export const openInExplorer = createAction({
  id: ID,
  name: 'Open path in explorer',
  displayString: "`Open ${fmt.param(params.path, 'primary')} in explorer`",
  params: {
    path: {
      label: 'Path',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory', 'openFile']
        }
      }
    }
  },

  outputs: {
    message: {
      label: 'Message',
      value: ''
    }
  },
  description: 'Open a file or folder in your explorer',
  icon: '',
  meta: {}
})

export const openInExplorerRunner = createActionRunner<typeof openInExplorer>(
  async ({ log, inputs, setOutput }) => {
    const { shell } = await import('electron')

    log(`Opening ${inputs.path}`)
    const message = await shell.openPath(inputs.path)
    setOutput('message', message)
  }
)
