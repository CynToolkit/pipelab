import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'
// import displayString from './displayStringRun.lua?raw'

export const ID = 'fs:open-in-explorer'

export const openInExplorer = createAction({
  id: ID,
  name: 'Open path in explorer',
  displayString: "`Open ${fmt.param(params.path, 'primary', 'No path set')} in explorer`",
  params: {
    path: createPathParam('', {
      required: true,
      label: 'Path',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory', 'openFile']
        }
      }
    })
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
