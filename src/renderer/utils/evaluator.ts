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

  const result: Record<string, string> = {}

  for (const [paramName, param] of Object.entries(data.params)) {
    try {
      const parameterCodeValue = (param.value ?? '').toString()

      const output = await vm.run(parameterCodeValue, {
        steps: data.steps,
        params: {},
        variables: data.variables
      })

      const outputResult = onItem(output)

      result[paramName] = outputResult
    } catch (e) {
      logger().error('error', e)
    }
  }
  return result
}
