import { createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { createPreviewProps, forge } from './forge'
import { merge } from 'ts-deepmerge'
import { defaultElectronConfig } from './utils'

export const previewRunner = createActionRunner<ReturnType<typeof createPreviewProps>>(
  async (options) => {
    const url = options.inputs['input-url']
    if (url === '') {
      throw new Error("URL can't be empty")
    }

    if (!options.inputs.configuration) {
      throw new Error('Missing electron configuration')
    }

    const completeConfiguration = merge(
      defaultElectronConfig,
      options.inputs.configuration
    ) as DesktopApp.Electron

    const output = await forge('package', undefined, options, completeConfiguration)
    options.log('Opening preview', JSON.stringify(output))
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
