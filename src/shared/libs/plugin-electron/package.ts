import { createActionRunner } from '@pipelab/plugin-core'
import { createPackageProps, forge } from './forge'
import { merge } from 'ts-deepmerge'
import { defaultElectronConfig } from './utils'

export const packageRunner = createActionRunner<ReturnType<typeof createPackageProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    if (!options.inputs.configuration) {
      throw new Error('Missing electron configuration')
    }

    const completeConfiguration = merge(
      defaultElectronConfig,
      options.inputs.configuration
    ) as DesktopApp.Electron

    // @ts-expect-error options is not really compatible
    await forge('package', appFolder, options, completeConfiguration)
  }
)
