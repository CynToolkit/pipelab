import { BlockAction, Steps } from '@@/model'
import { createQuickJs, CreateQuickJSFn } from './quickjs'
import { useLogger } from '@@/logger'

export const makeResolvedParams = async (
  data: {
    params: BlockAction['params']
    steps: Steps
    variables: Record<string, string>
    context: Record<string, unknown>
  },
  onItem: (item: any) => string = (item: any) => item,
  _vm?: Awaited<CreateQuickJSFn> | undefined
) => {
  const { logger } = useLogger()
  const vm = _vm ?? (await createQuickJs())

  const result: Record<string, any> = {}

  const ctx = 'createContext' in vm ? (vm as any).createContext() : null

  for (const [paramName, param] of Object.entries(data.params)) {
    try {
      const parameterCodeValue = (param.value ?? '').toString()

      const runParams = {
        steps: data.steps,
        params: {},
        variables: data.variables
      }

      const output = ctx ? ctx.run(parameterCodeValue, runParams) : await vm.run(parameterCodeValue, runParams)

      const outputResult = onItem(output)

      result[paramName] = outputResult
    } catch (e) {
      logger().error('error', e)
      result[paramName] = ''
    }
  }

  if (ctx) {
    ctx.dispose()
  }

  return result
}
