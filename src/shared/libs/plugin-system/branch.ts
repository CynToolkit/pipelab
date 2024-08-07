import { createCondition, createConditionRunner } from '@cyn/plugin-core'

export const ID = 'branch'

export const branchCondition = createCondition({
  id: ID,
  icon: '',
  name: 'Branch',
  description: '',
  displayString: 'If {{ params.valueA }} {{ params.operator }} {{ params.valueB }}',
  params: {
    valueA: {
      value: '',
      label: 'First value',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    operator: {
      value: '',
      label: 'Comparison',
      control: {
        type: 'select',
        options: {
          placeholder: 'Comparison',
          options: [
            {
              label: '=',
              value: '='
            }
          ]
        }
      }
    },
    valueB: {
      value: '',
      label: 'Second value',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    }
  }
})

export const branchConditionRunner = createConditionRunner<typeof branchCondition>(
  async ({ log, inputs }) => {
    const firstValue = inputs.valueA
    const secondValue = inputs.valueB
    const operator = inputs.operator as '=' | '!=' | '<' | '<=' | '>' | '>='

    let result
    switch (operator) {
      case '!=':
        result = firstValue != secondValue
        break

      case '<':
        result = firstValue < secondValue
        break

      case '<=':
        result = firstValue <= secondValue
        break

      case '=':
        result = firstValue === secondValue
        break

      case '>':
        result = firstValue > secondValue
        break

      case '>=':
        result = firstValue >= secondValue
        break

      default:
        throw new Error('Unhandled case')
    }

    return result
  }
)
