import type { ConditionalPick } from 'type-fest'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { UseMainAPI } from '@main/api'

export type PathOptions = {
  filter?: RegExp
  type?: 'file' | 'folder'
}

// export const definitionToSocket = (
//   definition: InputOutputDefinition,
//   side: "input" | "output"
// ) => {
//   return match(definition)
//     .returnType<CynSocket>()
//     .with({ kind: "any" }, (def) => {
//       return unknown(def);
//     })
//     .with({ kind: "array" }, (def) => {
//       return array(def);
//     })
//     .with({ kind: "boolean" }, (def) => {
//       return boolean(def);
//     })
//     .with({ kind: "number" }, (def) => {
//       return number(def);
//     })
//     .with({ kind: "string" }, (def) => {
//       return string(def);
//     })
//     .with(
//       {
//         kind: {
//           type: "array",
//         },
//       },
//       (def) => {
//         return array(def);
//       }
//     )
//     .with({ kind: Pattern.array() }, (def) => {
//       // eslint-disable-next-line @typescript-eslint/no-unused-vars
//       const map = def.kind.map((x) =>
//         definitionToSocket(
//           {
//             ...def,
//             kind: x,
//           },
//           side
//         )
//       );
//       console.warn("Array kinds are not yet supported");
//       return unknown(def);
//     })
//     .exhaustive();
// };

export type PropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | {
      type: 'array'
      of: PropType
    }
  | 'any'
  | PropType[]

// export type PropTypeToType<T extends PropType> = T extends "string"
//   ? string
//   : T extends "number"
//     ? number
//     : T extends "any"
//       ? any
//       : T extends "boolean"
//         ? boolean
//         : T extends "path"
//           ? string
//           : T extends "array"
//             ? unknown[]
//             : T extends "checkbox"
//               ? boolean
//               // a union of values
//               : T extends any[]
//                 ? PropTypeToType<T[number]>
//                 // an array of any type
//                 : T extends { type: "array"; of: any }
//                   ? Array<PropTypeToType<T["of"]>>
//                   : never;

// type a1 = PropTypeToType<"string">;
// type a2 = PropTypeToType<"number">;
// type a3 = PropTypeToType<"any">;
// type a6 = PropTypeToType<["string", "number"]>;
// type a7 = PropTypeToType<{ type: "array"; of: "string" }>;
// type a8 = PropTypeToType<{
//   type: "array";
//   of: [
//     {
//       type: "array";
//       of: ["string", "number"];
//     },
//     "boolean",
//   ];
// }>;

export interface ControlTypeBase {
  type: string
  // options: {
  // value: any;
  // onChange: (value: any) => void;
  // };
}

export interface ControlTypeInput extends ControlTypeBase {
  type: 'input'
  options: {
    kind: 'number' | 'text'
    validator?: string
    placeholder?: string
    password?: boolean
    // value: string;
    // onChange: (value: any) => void;
  }
}

export interface ControlTypeExpression extends ControlTypeBase {
  type: 'expression'
  options: {
    // kind: "number" | "text";
    // value: string;
    // onChange: (value: any) => void;
  }
}

export interface PipelabSelectOption {
  label: string
  value: string
}

export interface ControlTypeSelect extends ControlTypeBase {
  type: 'select'
  options: {
    options: Array<PipelabSelectOption>
    placeholder: string
  }
}

export interface ControlTypeMultiSelect extends ControlTypeBase {
  type: 'multi-select'
  options: {
    options: Array<PipelabSelectOption>
    placeholder: string
  }
}

export interface ControlTypeBoolean extends ControlTypeBase {
  type: 'boolean'
  // options?: {
  //   allowAuto?: boolean
  // }
}

export interface ControlTypeCheckbox extends ControlTypeBase {
  type: 'checkbox'
  // options: {
  //   value: boolean;
  //   onChange: (value: boolean) => void;
  // };
}

export interface ControlTypePath extends ControlTypeBase {
  type: 'path'
  options: OpenDialogOptions
  label?: string
}

export interface ControlTypeJSON extends ControlTypeBase {
  type: 'json'
  // options: {
  //   value: string;
  //   onChange: (value: string) => void;
  // };
}

export interface ControlTypeArray extends ControlTypeBase {
  type: 'array'
  options: {
    kind: 'number' | 'text'
  }
}

export interface ControlTypeElectronConfigureV2 extends ControlTypeBase {
  type: 'electron:configure:v2'
}

export type ControlType =
  | ControlTypeInput
  | ControlTypeSelect
  | ControlTypeMultiSelect
  | ControlTypeBoolean
  | ControlTypeCheckbox
  | ControlTypePath
  | ControlTypeJSON
  | ControlTypeExpression
  | ControlTypeArray
  | ControlTypeElectronConfigureV2

export type InputDefinition<T extends ControlType = ControlType> = {
  label: string
  description?: string
  validator?: () => any
  required: boolean
  // validator?: z.ZodTypeAny
  control: T
  value: unknown
  platforms?: NodeJS.Platform[]
}

export type InputsDefinition = Record<string, InputDefinition>
export type Meta = Record<string, unknown>

export interface OutputDefinition {
  label: string
  description?: string
  deprecated?: boolean
  // validator: z.ZodTypeAny
  validator?: (value: any) => any
  control?: ControlType
  value: unknown
}

export type OutputsDefinition = Record<string, OutputDefinition>

export type InputOutputDefinition = InputDefinition | OutputDefinition

export type IconType =
  | {
      type: 'image'
      /**
       * base64 image
       */
      image: string
    }
  | {
      type: 'icon'
      icon: string
    }
export interface PluginDefinition {
  id: string
  name: string
  icon: IconType
  description: string
}

export type RendererNodeDefinition = {
  node: PipelabNode
}

export interface RendererPluginDefinition extends PluginDefinition {
  nodes: Array<RendererNodeDefinition>
}

export interface MainPluginDefinition extends PluginDefinition {
  nodes: ({
    runner: Runner
  } & RendererNodeDefinition)[]
  validators?: Array<{
    id: string
    description: string
    validator: (options: any) => any
  }>
}

export const createNodeDefinition = (def: MainPluginDefinition) => {
  return def
}

export type RunnerCallbackFnArgument = {
  done: () => void
  id: string
  log: (...args: Parameters<(typeof console)['log']>) => void
}

// type friendly version of execute
// export const createRunner = <DEF extends MainPluginDefinition>(
//   callback: (data: RunnerCallbackFnArgument<DEF>) => Promise<void>
// ) => {
//   return callback;
// };

export type InputsOutputsDefinition = InputsDefinition | OutputsDefinition

export type GetFlowEntries<T extends InputsOutputsDefinition> = ConditionalPick<T, { type: 'flow' }>
export type GetDataEntries<T extends InputsOutputsDefinition> = ConditionalPick<T, { type: 'data' }>

export type GetFlowKeys<T extends InputsOutputsDefinition> = keyof GetFlowEntries<T>
export type GetDataKeys<T extends InputsOutputsDefinition> = keyof GetDataEntries<T>

export type DataResult = Record<string, any>

export type SetOutputActionFn<T extends Action> = (
  key: keyof T['outputs'],
  value: T['outputs'][typeof key]['value']
) => void
export type SetOutputLoopFn<T extends Loop> = (
  key: keyof T['outputs'],
  value: T['outputs'][typeof key]['value']
) => void
export type SetOutputExpressionFn<T extends Expression> = (
  key: keyof T['outputs'],
  value: T['outputs'][typeof key]['value']
) => void

export type ParamsToInput<PARAMS extends InputsDefinition> = {
  [index in keyof PARAMS]: PARAMS[index]['required'] extends true
    ? PARAMS[index]['value']
    : PARAMS[index]['value'] | null
}

export interface BaseNode {
  disabled?: boolean | string
  advanced?: boolean | string
  updateAvailable?: boolean | string
}

export interface Action extends BaseNode {
  id: string
  type: 'action'
  version?: number
  displayString: string
  icon: string
  name: string
  description: string
  params: InputsDefinition
  meta: Meta
  outputs: OutputsDefinition
  platforms?: NodeJS.Platform[]
  deprecated?: boolean
  deprecatedMessage?: string
}

export type ExtractInputsFromAction<ACTION extends Action> = {
  [index in keyof ACTION['params']]: ACTION['params'][index]['value']
}

export type ExtractInputsFromCondition<CONDITION extends Condition> = {
  [index in keyof CONDITION['params']]: CONDITION['params'][index]['value']
}
export type ExtractInputsFromLoop<LOOP extends Loop> = {
  [index in keyof LOOP['params']]: LOOP['params'][index]['value']
}
export type ExtractInputsFromEvent<EVENT extends Event> = {
  [index in keyof EVENT['params']]: EVENT['params'][index]['value']
}
export type ExtractInputsFromExpression<EXPRESSION extends Expression> = {
  [index in keyof EXPRESSION['params']]: EXPRESSION['params'][index]['value']
}

export type ActionRunnerData<ACTION extends Action> = {
  log: typeof console.log
  setOutput: SetOutputActionFn<ACTION>
  // inputs: ParamsToInput<ExtractInputsFromAction<ACTION>>,
  inputs: ExtractInputsFromAction<ACTION>
  setMeta: (callback: (data: ACTION['meta']) => ACTION['meta']) => void
  meta: ACTION['meta']
  cwd: string
  paths: {
    unpack: string
    assets: string
    cache: string
    pnpm: string
    node: string
  }
  api: UseMainAPI
  browserWindow: BrowserWindow
  abortSignal: AbortSignal
}

export type ActionRunner<ACTION extends Action> = (data: ActionRunnerData<ACTION>) => Promise<void>
export const createActionRunner = <ACTION extends Action>(runner: ActionRunner<ACTION>) => runner

// ---

export interface Condition extends BaseNode {
  id: string
  type: 'condition'
  version?: number
  displayString: string
  icon: string
  name: string
  description: string
  params: InputsDefinition
  meta?: Meta
  platforms?: NodeJS.Platform[]
}
export type ConditionRunner<CONDITION extends Condition> = (data: {
  log: typeof console.log
  inputs: ExtractInputsFromCondition<CONDITION>
  setMeta: (callback: (data: CONDITION['meta']) => CONDITION['meta']) => void
  meta: CONDITION['meta']
  cwd: string
}) => Promise<boolean>
export const createConditionRunner = <CONDITION extends Condition>(
  runner: ConditionRunner<CONDITION>
) => runner

// ---

export interface Loop extends BaseNode {
  id: string
  type: 'loop'
  version?: number
  displayString: string
  icon: string
  name: string
  description: string
  params: InputsDefinition
  meta?: Meta
  outputs: OutputsDefinition
}
type LoopRunner<LOOP extends Loop> = (data: {
  log: typeof console.log
  setOutput: SetOutputLoopFn<LOOP>
  inputs: ExtractInputsFromLoop<LOOP>
  setMeta: (callback: (data: LOOP['meta']) => LOOP['meta']) => void
  meta: LOOP['meta']
  cwd: string
}) => Promise<'step' | 'exit'>
export const createLoopRunner = <LOOP extends Loop>(runner: LoopRunner<LOOP>) => runner

export interface Expression extends BaseNode {
  id: string
  type: 'expression'
  displayString: string
  version?: number
  icon: string
  name: string
  description: string
  params: InputsDefinition
  meta?: Meta
  outputs: OutputsDefinition
}
type ExpressionRunner<EXPRESSION extends Expression> = (data: {
  log: typeof console.log
  setOutput: SetOutputExpressionFn<EXPRESSION>
  inputs: ExtractInputsFromExpression<EXPRESSION>
  setMeta: (callback: (data: EXPRESSION['meta']) => EXPRESSION['meta']) => void
  meta: EXPRESSION['meta']
  cwd: string
}) => Promise<string>
export const createExpressionRunner = <EXPRESSION extends Expression>(
  runner: ExpressionRunner<EXPRESSION>
) => runner

export interface Event extends BaseNode {
  id: string
  type: 'event'
  version?: number
  displayString: string
  icon: string
  name: string
  description: string
  params: InputsDefinition
  meta?: Meta
  platforms?: NodeJS.Platform[]
}
type EventRunner<EVENT extends Event> = (data: {
  log: typeof console.log
  inputs: ExtractInputsFromEvent<EVENT>
  setMeta: (callback: (data: EVENT['meta']) => EVENT['meta']) => void
  meta: EVENT['meta']
  cwd: string
}) => Promise<void>
export const createEventRunner = <EVENT extends Event>(runner: EventRunner<EVENT>) => runner

export type PipelabNode = Event | Condition | Expression | Action | Loop

export const createDefinition = <T extends MainPluginDefinition>(definition: T) => {
  return definition satisfies T
}

export const createAction = <T extends Omit<Action, 'type'>>(action: T) => {
  return {
    ...action,
    type: 'action'
  } satisfies Action
}

export const createStringParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, 'value' | 'control'>
) => {
  return {
    ...definition,
    control: {
      type: 'input',
      options: {
        kind: 'text'
      }
    },
    value: `"${value}"`
  } satisfies InputDefinition<ControlTypeInput>
}
export const createPasswordParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, 'value' | 'control'>
) => {
  return {
    ...definition,
    control: {
      type: 'input',
      options: {
        kind: 'text',
        password: true
      }
    },
    value: `"${value}"`
  } satisfies InputDefinition<ControlTypeInput>
}

export const createPathParam = (
  value: string | undefined,
  definition: Omit<InputDefinition<ControlTypePath>, 'value'>
) => {
  return {
    ...definition,
    value: value ? `"${value}"` : value
  } satisfies InputDefinition<ControlTypePath>
}
export const createArray = <T extends unknown[]>(
  value: string | Array<unknown>,
  definition: Omit<InputDefinition<ControlTypeArray>, 'value'>
) => {
  return {
    ...definition,
    value: (Array.isArray(value) ? `"${value}"` : value) as unknown as T
  } satisfies InputDefinition<ControlTypeArray>
}

export const createNumberParam = (
  value: number,
  definition: Omit<InputDefinition<ControlTypeInput>, 'value' | 'control'>
) => {
  return {
    ...definition,
    control: {
      type: 'input',
      options: {
        kind: 'number'
      }
    },
    value
  } satisfies InputDefinition<ControlTypeInput>
}

export const createBooleanParam = (
  value: boolean,
  definition: Omit<InputDefinition<ControlTypeBoolean>, 'value' | 'control'>
) => {
  return {
    ...definition,
    control: {
      type: 'boolean'
    },
    value
  } satisfies InputDefinition<ControlTypeBoolean>
}

export const createRawParam = <T>(value: T, definition: Omit<InputDefinition, 'value'>) => {
  return {
    ...definition,
    value
  }
}

export const createExpression = <T extends Omit<Expression, 'type'>>(expression: T) => {
  return {
    ...expression,
    type: 'expression'
  } satisfies Expression
}

export const createCondition = <T extends Omit<Condition, 'type'>>(condition: T) => {
  return {
    ...condition,
    type: 'condition'
  } satisfies Condition
}

export const createLoop = <T extends Omit<Loop, 'type'>>(loop: T) => {
  return {
    ...loop,
    type: 'loop'
  } satisfies Loop
}

export const createEvent = <T extends Omit<Event, 'type'>>(event: T) => {
  return {
    ...event,
    type: 'event'
  } satisfies Event
}

export type Runner = ActionRunner<any> | LoopRunner<any> | EventRunner<any> | ConditionRunner<any>

const a1 = createAction({
  id: 'aaa',
  name: 'AAA',
  icon: '',
  displayString: '',
  meta: {},
  description: '',
  run: async () => {
    //
  },
  params: {
    aaa: {
      value: 'aaa',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      },
      label: 'AAA'
    },
    bbb: {
      value: 12,
      label: 'BBB',
      control: {
        type: 'input',
        options: {
          kind: 'number'
        }
      }
    },
    ccc: {
      value: ['aaa'],
      label: 'CCC',
      control: {
        type: 'select',
        options: {
          placeholder: 'aaa',
          options: [
            {
              label: 'AAA',
              value: 'aaa'
            }
          ]
        }
      }
    },
    ddd: {
      value: ['a', 12],
      label: 'DDD',
      control: {
        type: 'select',
        options: {
          placeholder: 'ddd',
          options: [
            {
              label: 'AAA',
              value: 'aaa'
            }
          ]
        }
      }
    }
  },
  outputs: {
    aaa: {
      value: 'string',
      label: 'AAA',
      validator: (value) => value === 'hello' || value == 'bye'
    },
    bbb: {
      label: 'BBB',
      //   schema: z.number(),
      value: 12
    },
    ccc: {
      label: 'CCC',
      //   schema: z.array(z.string()),
      value: [] as string[]
    },
    ddd: {
      label: 'DDD',
      value: undefined as Array<string | number> | undefined
    }
  }
})

const sleep = (duration: number) => {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
