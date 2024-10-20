import { BlockAction, Steps } from '@@/model'
import { createQuickJs, CreateQuickJSFn } from './quickjs'
import { Variable } from '@pipelab/core-app'
import { useLogger } from '@@/logger'
import { variableToFormattedVariable } from '@renderer/composables/variables'

export const makeResolvedParams = async (
  data: {
    params: BlockAction['params']
    steps: Steps
    variables: Array<Variable>
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
      const output = await vm.run(param.value.toString(), {
        steps: data.steps,
        params: {},
        variables: variableToFormattedVariable(data.variables)
      })

      const outputResult = onItem(output)

      result[paramName] = outputResult
    } catch (e) {
      logger().error('error', e)
    }
  }
  return result
}
