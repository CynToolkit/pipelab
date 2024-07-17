import { Steps } from '@@/model'
import { createQuickJs } from './quickjs'
import DOMPurify from 'dompurify'
import { Variable } from '@cyn/core'
import { fmt } from './fmt'

export const makeResolvedParams = async (
  data: {
    params: Record<string, any>
    steps: Steps
    variables: Array<Variable>
    context: Record<string, unknown>
  },
  onItem: (item: any) => string = (item: any) => item
) => {
  const vm = await createQuickJs()

  const result: Record<string, string> = {}

  for (const [paramName, param] of Object.entries(data.params)) {
    try {
      const output = await vm.run(param, {
        steps: data.steps,
        params: {}
      })

      const outputResult = onItem(output)

      result[paramName] = outputResult
    } catch (e) {
      console.error('error', e)
    }
  }
  return result
}
