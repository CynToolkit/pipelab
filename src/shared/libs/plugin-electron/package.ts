import { createActionRunner } from '@pipelab/plugin-core'
import { createPackageProps, forge } from './forge'

export const packageRunner = createActionRunner<ReturnType<typeof createPackageProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    // @ts-expect-error options is not really compatible
    await forge('package', appFolder, options)
  }
)
