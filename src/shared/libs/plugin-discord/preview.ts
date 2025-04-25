import { createActionRunner } from '@pipelab/plugin-core'
import { createPreviewProps, discord } from './discord'
import { merge } from 'ts-deepmerge'

export const previewRunner = createActionRunner<ReturnType<typeof createPreviewProps>>(
  async (options) => {
    const inputFolder = options.inputs['input-folder']
    if (inputFolder === '') {
      throw new Error("URL can't be empty")
    }

    // if (!options.inputs.configuration) {
    //   throw new Error('Missing tauri configuration')
    // }

    const completeConfiguration = merge({}, {
      ...options.inputs
    } satisfies any) as any

    console.log('completeConfiguration', completeConfiguration)

    await discord('preview', inputFolder, options, completeConfiguration)
    return
  }
)
