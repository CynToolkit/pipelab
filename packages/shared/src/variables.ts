import { CreateQuickJSFn } from "./quickjs";

export interface VariableBase {
  value: string;
  id: string;
  name: string;
  description: string;
}

export type Variable = VariableBase;

export const variableToFormattedVariable = async (
  vm: Awaited<CreateQuickJSFn>,
  variables: Variable[],
) => {
  const result: Record<string, string> = {};
  for (const variable of variables) {
    console.log("variable.value", variable.value);
    const variableResult = await vm.run(variable.value, {
      params: {},
    });

    result[variable.id] = variableResult;
    // result[variable.id] = variable.value
  }
  return result;
};
