import { createActionRunner } from '@pipelab/plugin-core'
import { forge, createMakeProps } from './forge'
import { merge } from 'ts-deepmerge'
import { defaultElectronConfig } from './utils'

export const makeRunner = createActionRunner<ReturnType<typeof createMakeProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    if (!options.inputs.configuration) {
      throw new Error('Missing electron configuration')
    }

    const completeConfiguration = merge(
      defaultElectronConfig,
      options.inputs.configuration
    ) as DesktopApp.Electron

    await forge('make', appFolder, options, completeConfiguration)
  }
)
