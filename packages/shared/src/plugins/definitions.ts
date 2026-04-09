import type { ConditionalPick } from "type-fest";
import type { BrowserWindow, OpenDialogOptions } from "electron";

export type PathOptions = {
  filter?: RegExp;
  type?: "file" | "folder";
};

export type PropType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | {
      type: "array";
      of: PropType;
    }
  | "any"
  | PropType[];

export interface ControlTypeBase {
  type: string;
}

export interface ControlTypeInput extends ControlTypeBase {
  type: "input";
  options: {
    kind: "number" | "text";
    validator?: string;
    placeholder?: string;
    password?: boolean;
  };
}

export interface ControlTypeExpression extends ControlTypeBase {
  type: "expression";
  options: {};
}

export interface ControlTypeNetlifySite extends ControlTypeBase {
  type: "netlify-site";
  options: {
    allowCreate?: boolean;
    placeholder?: string;
    tokenKey: string;
  };
}

export interface PipelabSelectOption {
  label: string;
  value: string;
}

export interface ControlTypeSelect extends ControlTypeBase {
  type: "select";
  options: {
    options: Array<PipelabSelectOption>;
    placeholder: string;
  };
}

export interface ControlTypeMultiSelect extends ControlTypeBase {
  type: "multi-select";
  options: {
    options: Array<PipelabSelectOption>;
    placeholder: string;
  };
}

export interface ControlTypeBoolean extends ControlTypeBase {
  type: "boolean";
}

export interface ControlTypeCheckbox extends ControlTypeBase {
  type: "checkbox";
}

export interface ControlTypePath extends ControlTypeBase {
  type: "path";
  options: OpenDialogOptions;
  label?: string;
}

export interface ControlTypeJSON extends ControlTypeBase {
  type: "json";
}

export interface ControlTypeArray extends ControlTypeBase {
  type: "array";
  options: {
    kind: "number" | "text";
  };
}

export interface ControlTypeColor extends ControlTypeBase {
  type: "color";
}

export interface ControlTypeElectronConfigureV2 extends ControlTypeBase {
  type: "electron:configure:v2";
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
  | ControlTypeNetlifySite
  | ControlTypeArray
  | ControlTypeColor
  | ControlTypeElectronConfigureV2;

export type InputDefinition<T extends ControlType = ControlType> = {
  label: string;
  description?: string;
  validator?: () => any;
  required: boolean;
  control: T;
  value: unknown;
  platforms?: NodeJS.Platform[];
  onNodeUpdate?: (value: any, settings: InputDefinition<any>) => void;
};

export type InputsDefinition = Record<string, InputDefinition>;
export type Meta = Record<string, unknown>;

export interface OutputDefinition {
  label: string;
  description?: string;
  deprecated?: boolean;
  validator?: (value: any) => any;
  control?: ControlType;
  value: unknown;
}

export type OutputsDefinition = Record<string, OutputDefinition>;

export type InputOutputDefinition = InputDefinition | OutputDefinition;

export type IconType =
  | {
      type: "image";
      /**
       * base64 image
       */
      image: string;
    }
  | {
      type: "icon";
      icon: string;
    };
export interface PluginDefinition {
  id: string;
  name: string;
  icon: IconType;
  description: string;
}

export type RendererNodeDefinition = {
  node: PipelabNode;
};

export interface RendererPluginDefinition extends PluginDefinition {
  nodes: Array<RendererNodeDefinition>;
}

export interface MainPluginDefinition extends PluginDefinition {
  nodes: ({
    runner: any; // We use 'any' here to avoid importing Node runners in the safe definition
  } & RendererNodeDefinition)[];
  validators?: Array<{
    id: string;
    description: string;
    validator: (options: any) => any;
  }>;
}

export const createNodeDefinition = (def: MainPluginDefinition) => {
  return def;
};

export type InputsOutputsDefinition = InputsDefinition | OutputsDefinition;

export type GetFlowEntries<T extends InputsOutputsDefinition> = ConditionalPick<
  T,
  { type: "flow" }
>;
export type GetDataEntries<T extends InputsOutputsDefinition> = ConditionalPick<
  T,
  { type: "data" }
>;

export type GetFlowKeys<T extends InputsOutputsDefinition> = keyof GetFlowEntries<T>;
export type GetDataKeys<T extends InputsOutputsDefinition> = keyof GetDataEntries<T>;

export type DataResult = Record<string, any>;

export type SetOutputActionFn<T extends Action> = (
  key: keyof T["outputs"],
  value: T["outputs"][typeof key]["value"],
) => void;
export type SetOutputLoopFn<T extends Loop> = (
  key: keyof T["outputs"],
  value: T["outputs"][typeof key]["value"],
) => void;
export type SetOutputExpressionFn<T extends Expression> = (
  key: keyof T["outputs"],
  value: T["outputs"][typeof key]["value"],
) => void;

export type ParamsToInput<PARAMS extends InputsDefinition> = {
  [index in keyof PARAMS]: PARAMS[index]["required"] extends true
    ? PARAMS[index]["value"]
    : PARAMS[index]["value"] | null;
};

export interface BaseNode {
  disabled?: boolean | string;
  advanced?: boolean | string;
  updateAvailable?: boolean | string;
}

export interface Action extends BaseNode {
  id: string;
  type: "action";
  version?: number;
  displayString: string;
  icon: string;
  name: string;
  description: string;
  params: InputsDefinition;
  meta: Meta;
  outputs: OutputsDefinition;
  platforms?: NodeJS.Platform[];
  deprecated?: boolean;
  deprecatedMessage?: string;
}

export type ExtractInputsFromAction<ACTION extends Action> = {
  [index in keyof ACTION["params"]]: ACTION["params"][index]["value"];
};

export type ExtractInputsFromCondition<CONDITION extends Condition> = {
  [index in keyof CONDITION["params"]]: CONDITION["params"][index]["value"];
};
export type ExtractInputsFromLoop<LOOP extends Loop> = {
  [index in keyof LOOP["params"]]: LOOP["params"][index]["value"];
};
export type ExtractInputsFromEvent<EVENT extends Event> = {
  [index in keyof EVENT["params"]]: EVENT["params"][index]["value"];
};
export type ExtractInputsFromExpression<EXPRESSION extends Expression> = {
  [index in keyof EXPRESSION["params"]]: EXPRESSION["params"][index]["value"];
};

export interface Condition extends BaseNode {
  id: string;
  type: "condition";
  version?: number;
  displayString: string;
  icon: string;
  name: string;
  description: string;
  params: InputsDefinition;
  meta?: Meta;
  platforms?: NodeJS.Platform[];
}

export interface Loop extends BaseNode {
  id: string;
  type: "loop";
  version?: number;
  displayString: string;
  icon: string;
  name: string;
  description: string;
  params: InputsDefinition;
  meta?: Meta;
  outputs: OutputsDefinition;
}

export interface Expression extends BaseNode {
  id: string;
  type: "expression";
  displayString: string;
  version?: number;
  icon: string;
  name: string;
  description: string;
  params: InputsDefinition;
  meta?: Meta;
  outputs: OutputsDefinition;
}

export interface Event extends BaseNode {
  id: string;
  type: "event";
  version?: number;
  displayString: string;
  icon: string;
  name: string;
  description: string;
  params: InputsDefinition;
  meta?: Meta;
  platforms?: NodeJS.Platform[];
}

export type PipelabNode = Event | Condition | Expression | Action | Loop;

export const createDefinition = <T extends MainPluginDefinition>(definition: T) => {
  return definition satisfies T;
};

export const createAction = <T extends Omit<Action, "type">>(action: T) => {
  return {
    ...action,
    type: "action",
  } satisfies Action;
};

export const createStringParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "text",
      },
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeInput>;
};

export const createColorPicker = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeColor>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "color",
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeColor>;
};

export const createPasswordParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "text",
        password: true,
      },
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeInput>;
};

export const createPathParam = (
  value: string | undefined,
  definition: Omit<InputDefinition<ControlTypePath>, "value">,
) => {
  return {
    ...definition,
    value: value ? `"${value}"` : value,
  } satisfies InputDefinition<ControlTypePath>;
};

export const createArray = <T extends unknown[]>(
  value: string | Array<unknown>,
  definition: Omit<InputDefinition<ControlTypeArray>, "value">,
) => {
  return {
    ...definition,
    value: (Array.isArray(value) ? `"${value}"` : value) as unknown as T,
  } satisfies InputDefinition<ControlTypeArray>;
};

export const createNetlifySiteParam = (
  value: string,
  tokenKey: string,
  definition: Omit<InputDefinition<ControlTypeNetlifySite>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "netlify-site",
      options: {
        allowCreate: true,
        placeholder: "Select a site",
        tokenKey,
      },
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeNetlifySite>;
};

export const createNumberParam = (
  value: number,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "number",
      },
    },
    value,
  } satisfies InputDefinition<ControlTypeInput>;
};

export const createBooleanParam = (
  value: boolean,
  definition: Omit<InputDefinition<ControlTypeBoolean>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "boolean",
    },
    value,
  } satisfies InputDefinition<ControlTypeBoolean>;
};

export const createRawParam = <T>(value: T, definition: Omit<InputDefinition, "value">) => {
  return {
    ...definition,
    value,
  };
};

export const createExpression = <T extends Omit<Expression, "type">>(expression: T) => {
  return {
    ...expression,
    type: "expression",
  } satisfies Expression;
};

export const createCondition = <T extends Omit<Condition, "type">>(condition: T) => {
  return {
    ...condition,
    type: "condition",
  } satisfies Condition;
};

export const createLoop = <T extends Omit<Loop, "type">>(loop: T) => {
  return {
    ...loop,
    type: "loop",
  } satisfies Loop;
};

export const createEvent = <T extends Omit<Event, "type">>(event: T) => {
  return {
    ...event,
    type: "event",
  } satisfies Event;
};
