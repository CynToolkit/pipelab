import {
  ExtractInputsFromAction,
  createAction,
  createActionRunner,
  createPathParam,
  fileExists
} from '@pipelab/plugin-core'
import { exportc3p, sharedParams } from './export-shared.js'
import { throttle } from 'es-toolkit'
import { zipFolder } from '@main/utils.js'

export const ID = 'export-construct-project-folder'

export const exportProjectAction = createAction({
  id: ID,
  name: 'Export folder',
  displayString: "`Export project ${params.version ? `r${params.version}` : ''}`",
  meta: {},
  params: {
    folder: createPathParam('', {
      required: true,
      label: 'Folder',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
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
  description: 'Export construct project from folder',
  icon: ''
})

export const ExportProjectActionRunner = createActionRunner<typeof exportProjectAction>(
  async (options) => {
    const { join } = await import('node:path')

    const c3pFolderExists = await fileExists(options.inputs.folder)
    if (!c3pFolderExists) {
      throw new Error('You must specify a valid construct project folder')
    }

    const outputPath = join(options.cwd, 'c3_tmp_proj.c3p')

    const to = await zipFolder(options.inputs.folder, outputPath, options.log)

    await exportc3p(to, options)
  }
)

export type Params = ExtractInputsFromAction<typeof exportProjectAction>
