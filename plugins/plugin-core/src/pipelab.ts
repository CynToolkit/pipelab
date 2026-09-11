import type { BrowserWindow } from "electron";
import type {
  Action,
  Expression,
  Event,
  SetOutputActionFn,
  SetOutputExpressionFn,
  ExtractInputsFromAction,
  ExtractInputsFromEvent,
  ExtractInputsFromExpression,
} from "@pipelab/shared";
import type { PipelabContext } from "@pipelab/core-node";

export type { PipelabContext } from "@pipelab/core-node";

export * from "@pipelab/shared";
import {
  type RunnerCallbackFnArgument,
  type ActionRunnerData,
  type ActionRunner,
  type ExpressionRunner,
  type EventRunner,
  type Runner,
} from "@pipelab/core-node";

export {
  type RunnerCallbackFnArgument,
  type ActionRunnerData,
  type ActionRunner,
  type ExpressionRunner,
  type EventRunner,
  type Runner,
};

export const createActionRunner = <ACTION extends Action>(
  runner: (data: ActionRunnerData<ACTION>) => Promise<void>,
) => runner;

export const createExpressionRunner = <EXPRESSION extends Expression>(
  runner: (data: {
    log: typeof console.log;
    setOutput: SetOutputExpressionFn<EXPRESSION>;
    inputs: ExtractInputsFromExpression<EXPRESSION>;
    setMeta: (callback: (data: EXPRESSION["meta"]) => EXPRESSION["meta"]) => void;
    meta: EXPRESSION["meta"];
    cwd: string;
    context: PipelabContext;
  }) => Promise<string>,
) => runner;

export const createEventRunner = <EVENT extends Event>(
  runner: (data: {
    log: typeof console.log;
    inputs: ExtractInputsFromEvent<EVENT>;
    setMeta: (callback: (data: EVENT["meta"]) => EVENT["meta"]) => void;
    meta: EVENT["meta"];
    cwd: string;
    context: PipelabContext;
  }) => Promise<void>,
) => runner;

export const sleep = (duration: number) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
};
