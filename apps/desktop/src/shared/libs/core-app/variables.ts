export interface VariableBase {
  value: string
  id: string
  name: string
  description: string
}

export type Variable = VariableBase

export const foo = 'aaa'
