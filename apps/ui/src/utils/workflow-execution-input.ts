import type { Data } from "@pipelab/shared";

/**
 * Sends a Desktop run with the environment values the Desktop shell returns for the workflow. The
 * shell decides which names the workflow binds, from the same plan the run uses, so the renderer
 * does not repeat that decision.
 */
export const submitDesktopWorkflowExecution = async <Result>(input: {
  request: Data<"workflow:execute">;
  readEnvironment: () => Promise<Readonly<Record<string, string | undefined>>>;
  execute: (request: Data<"workflow:execute">) => Promise<Result>;
}) => {
  const environment = await input.readEnvironment();
  const env = Object.fromEntries(
    Object.entries(environment).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]],
    ),
  );
  return input.execute({ ...input.request, env });
};
