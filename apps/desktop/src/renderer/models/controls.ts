import { ControlType } from '@pipelab/plugin-core'
import { match } from 'ts-pattern'

type PrimitiveConstructor =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'symbol'
  | 'function'
  | 'bigint'

export const controlsToType = (control: ControlType) => {
  return match(control)
    .returnType<PrimitiveConstructor>()
    .with({ type: 'path' }, () => 'string')
    .with({ type: 'input', options: { kind: 'number' } }, () => 'number')
    .with({ type: 'input', options: { kind: 'text' } }, () => 'string')
    .with({ type: 'boolean' }, () => 'boolean')
    .with({ type: 'checkbox' }, () => 'boolean')
    .with({ type: 'select' }, () => 'string')
    .with({ type: 'multi-select' }, () => 'object')
    .with({ type: 'json' }, () => 'object')
    .with({ type: 'expression' }, () => 'string')
    .with({ type: 'array', options: { kind: 'number' } }, () => 'object')
    .with({ type: 'array', options: { kind: 'text' } }, () => 'object')
    .with({ type: 'electron:configure:v2' }, () => 'object')
    .exhaustive()
}

export const controlsToIcon = (control: ControlType) => {
  return match(control)
    .returnType<string>()
    .with({ type: 'path' }, () => 'mdi-alphabetical-variant')
    .with({ type: 'input', options: { kind: 'number' } }, () => 'mdi-numeric')
    .with({ type: 'input', options: { kind: 'text' } }, () => 'mdi-alphabetical-variant')
    .with({ type: 'boolean' }, () => 'mdi-toggle-switch')
    .with({ type: 'checkbox' }, () => 'mdi-toggle-switch')
    .with({ type: 'select' }, () => 'mdi-alphabetical-variant')
    .with({ type: 'multi-select' }, () => 'mdi-code-brackets')
    .with({ type: 'json' }, () => 'mdi-code-braces')
    .with({ type: 'expression' }, () => 'mdi-')
    .with({ type: 'array', options: { kind: 'number' } }, () => 'mdi-code-brackets')
    .with({ type: 'array', options: { kind: 'text' } }, () => 'mdi-code-brackets')
    .with({ type: 'electron:configure:v2' }, () => 'mdi-code-braces')
    .exhaustive()
}
