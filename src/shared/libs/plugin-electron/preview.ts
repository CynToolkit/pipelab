import { createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { createProps, forge } from './forge'

export const previewRunner = createActionRunner<ReturnType<typeof createProps>>(async (options) => {
  const isUrl = 'input-url' in options.inputs
  if (!isUrl) {
    return;
  }

  const url = options.inputs['input-url']
  if (url === '') {
    throw new Error("URL can't be empty")
  }

  const output = await forge('package', options)
  options.log('Opening preview', output)
  options.log('Opening url', url)
  await runWithLiveLogs(output.binary, ['--url', url], {}, options.log)
  return
})
