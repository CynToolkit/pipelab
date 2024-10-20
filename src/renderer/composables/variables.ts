import { Variable } from '@@/libs/core-app'

export const variableToFormattedVariable = (variables: Variable[]) => {
  const result: Record<string, string> = {}
  for (const variable of variables) {
    result[variable.id] = variable.value
  }
  return result
}
