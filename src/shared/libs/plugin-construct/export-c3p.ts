import {
  ExtractInputsFromAction,
  createAction,
  createActionRunner,
  createPathParam,
  fileExists
} from '@pipelab/plugin-core'
import { exportc3p, sharedParams } from './export-shared.js'

export const ID = 'export-construct-project'

export const exportAction = createAction({
  id: ID,
  name: 'Export .c3p',
  displayString:
    "`Export project ${fmt.param(params.file, 'primary', 'No path selected')} ${params.version ? `r${params.version}` : ''}`",
  meta: {},
  params: {
    file: createPathParam('', {
      label: 'File (.c3p)',
      control: {
        type: 'path',
        label: 'Pick a file (.c3p)',
        options: {
          properties: ['openFile'],
          filters: [{ name: 'Construct Project', extensions: ['c3p'] }],
          title: 'aaaa',
          message: 'bbbb'
        }
      }
    }),
    ...sharedParams
  },
  outputs: {
    folder: {
      type: 'path',
      deprecated: true,
      value: undefined as undefined | string,
      label: 'Exported zip'
      // schema: schema.string()
    },
    parentFolder: {
      type: 'path',
      deprecated: false,
      value: undefined as undefined | string,
      label: 'Path to parent folder of exported zip'
      // schema: schema.string()
    },
    zipFile: {
      type: 'path',
      deprecated: false,
      value: undefined as undefined | string,
      label: 'Exported zip'
      // schema: schema.string()
    }
  },
  description: 'Export construct project from .c3p file',
  icon: ''
})

export const ExportActionRunner = createActionRunner<typeof exportAction>(async (options) => {
  const file = options.inputs.file

  const c3pFileExists = await fileExists(file)

  if (!c3pFileExists) {
    throw new Error('You must specify a valid .c3p file')
  }

  await exportc3p(file, options)
  options.log('exportc3p done')
})

export type Params = ExtractInputsFromAction<typeof exportAction>
