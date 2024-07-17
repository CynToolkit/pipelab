type StringTypeToType<T extends Variable['type']> =
  T extends 'string' ? string
  : T extends 'boolean' ? boolean
  : T extends 'array' ? unknown[]
  : never

export interface VariableBase {
  value: unknown;
  id: string;
  name: string;
  description: string;
}

export interface VariableString extends VariableBase {
  type: "string";
  value: string;
}

export interface VariableBoolean extends VariableBase {
  type: "boolean";
  value: boolean;
}

export interface VariableArray extends VariableBase {
  type: "array";
  of: Variable["type"];
  value: Array<StringTypeToType<this['of']>>;
}

export type Variable = VariableString | VariableBoolean | VariableArray;

export const foo = 'aaa'