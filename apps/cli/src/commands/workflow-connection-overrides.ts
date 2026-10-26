export type WorkflowConnectionOverrideValue =
  | { kind: "environment"; name: string }
  | { kind: "literal"; value: string };

export interface WorkflowConnectionOverride {
  alias: string;
  field: string;
  value: WorkflowConnectionOverrideValue;
}

const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const connectionAliasPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export const parseWorkflowConnectionOverride = (input: string): WorkflowConnectionOverride => {
  const assignmentIndex = input.indexOf("=");
  if (assignmentIndex < 0) throw new Error("Expected alias.field=VALUE for --connection.");

  const target = input.slice(0, assignmentIndex);
  const targetSeparatorIndex = target.indexOf(".");
  if (targetSeparatorIndex <= 0 || targetSeparatorIndex === target.length - 1)
    throw new Error("Expected alias.field=VALUE for --connection.");

  const alias = target.slice(0, targetSeparatorIndex);
  const field = target.slice(targetSeparatorIndex + 1);
  if (!connectionAliasPattern.test(alias) || !field.trim())
    throw new Error("Expected alias.field=VALUE for --connection.");
  const rawValue = input.slice(assignmentIndex + 1);

  if (rawValue.startsWith("env:")) {
    const name = rawValue.slice("env:".length);
    if (!environmentVariableNamePattern.test(name))
      throw new Error("Invalid environment variable name in --connection value.");
    return { alias, field, value: { kind: "environment", name } };
  }

  const value = rawValue.startsWith("literal:") ? rawValue.slice("literal:".length) : rawValue;
  return { alias, field, value: { kind: "literal", value } };
};

export const parseWorkflowConnectionOverrides = (values: readonly string[]) =>
  values.map(parseWorkflowConnectionOverride);
