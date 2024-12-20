import { InputDefinition } from "@pipelab/plugin-core"

export const isRequired = (param: InputDefinition) => {
  return param.required === true || !('required' in param)
}

export const isRenderer = () => {
  // running in a web browser
  if (typeof process === 'undefined') return true

  // node-integration is disabled
  if (!process) return true

  // @ts-expect-error
  return process.browser === true || process.title === 'browser'
};
