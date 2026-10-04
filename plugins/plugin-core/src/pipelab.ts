import type { Action } from "@pipelab/shared";

export type { PipelabContext } from "@pipelab/core-node";

export * from "@pipelab/shared";
import type { RunnerCallbackFnArgument, ActionRunnerData, ActionRunner } from "@pipelab/core-node";

export { type RunnerCallbackFnArgument, type ActionRunnerData, type ActionRunner };

export const createActionRunner = <ACTION extends Action>(
  runner: (data: ActionRunnerData<ACTION>) => Promise<void>,
) => runner;

export const sleep = (duration: number) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
};
