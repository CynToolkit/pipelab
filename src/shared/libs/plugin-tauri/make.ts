import { createActionRunner } from '@pipelab/plugin-core'
import { forge, createProps } from './shared'

export const makeRunner = createActionRunner<ReturnType<typeof createProps>>(async (options) => {
  await forge('make', options)
})
