import { createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { createPreviewProps, forge } from './forge'

export const previewRunner = createActionRunner<ReturnType<typeof createPreviewProps>>(
  async (options) => {
    const url = options.inputs['input-url']
    if (url === '') {
      throw new Error("URL can't be empty")
    }

    // @ts-expect-error options is not really compatible
    const output = await forge('package', undefined, options)
    options.log('Opening preview', output)
    options.log('Opening url', url)
    await runWithLiveLogs(
      output.binary,
      ['--url', url],
      {
        cancelSignal: options.abortSignal
      },
      options.log
    )
    return
  }
)
