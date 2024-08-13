import { createActionRunner } from '@cyn/plugin-core'
import { createProps, forge } from './forge'

export const packageRunner = createActionRunner<ReturnType<typeof createProps>>(async (options) => {
  await forge('package', options)
})
