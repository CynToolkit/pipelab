import { createActionRunner } from '@pipelab/plugin-core'
import { createMakeProps, tauri } from './tauri'
import { merge } from 'ts-deepmerge'
import { defaultTauriConfig } from './utils'

export const makeRunner = createActionRunner<ReturnType<typeof createMakeProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    if (!options.inputs.configuration) {
      throw new Error('Missing tauri configuration')
    }

    const completeConfiguration = merge(
      defaultTauriConfig,
      options.inputs.configuration
    ) as DesktopApp.Tauri

    await tauri('make', appFolder, options, completeConfiguration)
  }
)
