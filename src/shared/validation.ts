import { InputDefinition } from "@cyn/plugin-core"

export const isRequired = (param: InputDefinition) => {
  return param.required === true || !('required' in param)
}
