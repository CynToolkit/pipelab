import type { BrowserWindow } from "electron";
import { Action, Condition, Loop, Expression, Event, SetOutputActionFn, SetOutputLoopFn, SetOutputExpressionFn, ExtractInputsFromAction, ExtractInputsFromCondition, ExtractInputsFromLoop, ExtractInputsFromEvent, ExtractInputsFromExpression } from "@pipelab/shared";

export * from "@pipelab/shared";

export type RunnerCallbackFnArgument = {
  done: () => void;
  id: string;
  log: (...args: Parameters<(typeof console)["log"]>) => void;
};

export type ActionRunnerData<ACTION extends Action> = {
  log: typeof console.log;
  setOutput: SetOutputActionFn<ACTION>;
  inputs: ExtractInputsFromAction<ACTION>;
  setMeta: (callback: (data: ACTION["meta"]) => ACTION["meta"]) => void;
  meta: ACTION["meta"];
  cwd: string;
  paths: {
    assets: string;
    cache: string;
    pnpm: string;
    node: string;
    userData: string;
    modules: string;
    thirdparty: string;
  };
  api: {
    [key: string]: any;
  };
  browserWindow: BrowserWindow;
  abortSignal: AbortSignal;
};

export type ActionRunner<ACTION extends Action> = (data: ActionRunnerData<ACTION>) => Promise<void>;
export const createActionRunner = <ACTION extends Action>(runner: ActionRunner<ACTION>) => runner;

// ---

export type ConditionRunner<CONDITION extends Condition> = (data: {
  log: typeof console.log;
  inputs: ExtractInputsFromCondition<CONDITION>;
  setMeta: (callback: (data: CONDITION["meta"]) => CONDITION["meta"]) => void;
  meta: CONDITION["meta"];
  cwd: string;
}) => Promise<boolean>;
export const createConditionRunner = <CONDITION extends Condition>(
  runner: ConditionRunner<CONDITION>,
) => runner;

// ---

export type LoopRunner<LOOP extends Loop> = (data: {
  log: typeof console.log;
  setOutput: SetOutputLoopFn<LOOP>;
  inputs: ExtractInputsFromLoop<LOOP>;
  setMeta: (callback: (data: LOOP["meta"]) => LOOP["meta"]) => void;
  meta: LOOP["meta"];
  cwd: string;
}) => Promise<"step" | "exit">;
export const createLoopRunner = <LOOP extends Loop>(runner: LoopRunner<LOOP>) => runner;

export type ExpressionRunner<EXPRESSION extends Expression> = (data: {
  log: typeof console.log;
  setOutput: SetOutputExpressionFn<EXPRESSION>;
  inputs: ExtractInputsFromExpression<EXPRESSION>;
  setMeta: (callback: (data: EXPRESSION["meta"]) => EXPRESSION["meta"]) => void;
  meta: EXPRESSION["meta"];
  cwd: string;
}) => Promise<string>;
export const createExpressionRunner = <EXPRESSION extends Expression>(
  runner: ExpressionRunner<EXPRESSION>,
) => runner;

export type EventRunner<EVENT extends Event> = (data: {
  log: typeof console.log;
  inputs: ExtractInputsFromEvent<EVENT>;
  setMeta: (callback: (data: EVENT["meta"]) => EVENT["meta"]) => void;
  meta: EVENT["meta"];
  cwd: string;
}) => Promise<void>;
export const createEventRunner = <EVENT extends Event>(runner: EventRunner<EVENT>) => runner;

export type Runner = ActionRunner<any> | LoopRunner<any> | EventRunner<any> | ConditionRunner<any>;

export const sleep = (duration: number) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
};
