import {
  createAction,
  createActionRunner,
  createBooleanParam,
  createPathParam
} from '@pipelab/plugin-core'

export const ID = 'list-files-node'

export const ListFilesAction = createAction({
  id: ID,
  name: 'List files',
  displayString: "`List files \"${params.recursive ? 'recursively' : ''}\" from \"${params.folder}`",
  params: {
    folder: createPathParam('', {
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      },
      label: 'Folder',
      required: true
    }),
    recursive: createBooleanParam(false, {
      label: 'Recursive'
    })
  },
  outputs: {
    paths: {
      value: [] as string[],
      label: 'Paths'
    }
  },
  description: 'List files from a folder',
  icon: '',
  meta: {}
})

export const ListFilesActionRun = createActionRunner<typeof ListFilesAction>(
  async ({ log, inputs, setOutput }) => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const folder = inputs.folder
    const recursive = inputs.recursive

    const files = recursive
      ? await fs.readdir(folder, { withFileTypes: true, recursive: true })
      : await fs.readdir(folder, { withFileTypes: true })

    log('files', files)
    setOutput('paths', files.map((file) => path.join(file.parentPath, file.name)))
  }
)
