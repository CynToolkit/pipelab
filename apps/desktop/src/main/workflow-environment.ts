import type { ReleaseConfig } from "@pipelab/shared";

const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const readRequestedWorkflowEnvironment = (
  requestedNames: unknown,
  approvedNames: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> => {
  if (!Array.isArray(requestedNames))
    throw new Error("Workflow environment variable names must be an array of strings.");
  const stringNames = requestedNames.filter((name): name is string => typeof name === "string");
  if (stringNames.length !== requestedNames.length)
    throw new Error("Workflow environment variable names must be an array of strings.");
  const names = [...new Set(stringNames)];
  const invalidName = names.find((name) => !environmentNamePattern.test(name));
  if (invalidName) throw new Error(`Invalid workflow environment variable name: ${invalidName}`);
  const approved = new Set(approvedNames);
  const unapprovedName = names.find((name) => !approved.has(name));
  if (unapprovedName)
    throw new Error(`Workflow environment variable '${unapprovedName}' is not bound in this workflow.`);
  return Object.fromEntries(
    names.flatMap((name) =>
      typeof environment[name] === "string" ? [[name, environment[name]!]] : [],
    ),
  );
};

export const readWorkflowEnvironmentForWorkflow = async (
  workflowId: unknown,
  loadWorkflow: (id: string) => Promise<ReleaseConfig>,
  environmentNames: (config: ReleaseConfig) => readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> => {
  if (typeof workflowId !== "string" || workflowId.length === 0)
    throw new Error("A saved workflow ID is required to read environment values.");
  const config = await loadWorkflow(workflowId);
  const approvedNames = environmentNames(config);
  return readRequestedWorkflowEnvironment(approvedNames, approvedNames, environment);
};
