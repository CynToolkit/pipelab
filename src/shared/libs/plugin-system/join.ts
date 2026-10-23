import { createExpression, createExpressionRunner } from '@pipelab/plugin-core'

export const ID = 'join'

const DEFAULT_SEPARATOR = ', '

export const join = createExpression({
  id: ID,
  name: 'Join',
  description: 'Join values',
  displayString: 'Join {{ params.value }}',
  icon: '',
  meta: {},
  params: {
    input: {
      label: 'Input',
      value: [] as unknown[],
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    separator: {
      label: 'Separator',
      value: DEFAULT_SEPARATOR,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    }
  },
  outputs: {
    value: {
      label: 'Value',
      value: ''
    }
  }
})

export const evaluator = createExpressionRunner<typeof join>(async ({ inputs }) => {
  const rawInput: unknown = inputs?.input
  const inputValues: unknown[] = Array.isArray(rawInput) ? rawInput : []
  const firstInput: unknown = inputValues[0]
  const values: unknown[] = Array.isArray(firstInput) ? firstInput : inputValues

  const rawSeparator: unknown = inputs?.separator
  const separatorValues: unknown[] = Array.isArray(rawSeparator) ? rawSeparator : []
  const firstSeparator: unknown = separatorValues[0]
  const separator =
    typeof rawSeparator === 'string'
      ? rawSeparator
      : typeof firstSeparator === 'string'
        ? firstSeparator
        : DEFAULT_SEPARATOR

  return values.join(separator)
})
