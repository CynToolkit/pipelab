import { createActionRunner } from '@plugins/plugin-core'
import { forge, createMakeProps } from './forge'

export const makeRunner = createActionRunner<ReturnType<typeof createMakeProps>>(
  async (options) => {
    const appFolder = options.inputs['input-folder']

    // @ts-expect-error options is not really compatible
    await forge('make', appFolder, options)
  }
)
