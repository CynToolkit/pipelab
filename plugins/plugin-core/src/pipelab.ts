import type { BrowserWindow } from "electron";
import type {
  Action,
  Condition,
  Loop,
  Expression,
  Event,
  SetOutputActionFn,
  SetOutputLoopFn,
  SetOutputExpressionFn,
  ExtractInputsFromAction,
  ExtractInputsFromCondition,
  ExtractInputsFromLoop,
  ExtractInputsFromEvent,
  ExtractInputsFromExpression,
} from "@pipelab/shared";

export * from "@pipelab/shared";
import {
  type RunnerCallbackFnArgument,
  type ActionRunnerData,
  type ActionRunner,
  type ConditionRunner,
  type LoopRunner,
  type ExpressionRunner,
  type EventRunner,
  type Runner,
  PipelabContext,
} from "@pipelab/core-node";

export {
  type RunnerCallbackFnArgument,
  type ActionRunnerData,
  type ActionRunner,
  type ConditionRunner,
  type LoopRunner,
  type ExpressionRunner,
  type EventRunner,
  type Runner,
  PipelabContext,
};

export const createActionRunner = <ACTION extends Action>(
  runner: (data: ActionRunnerData<ACTION>) => Promise<void>,
) => runner;

export const createConditionRunner = <CONDITION extends Condition>(
  runner: (data: {
    log: typeof console.log;
    inputs: ExtractInputsFromCondition<CONDITION>;
    setMeta: (callback: (data: CONDITION["meta"]) => CONDITION["meta"]) => void;
    meta: CONDITION["meta"];
    cwd: string;
    context: PipelabContext;
  }) => Promise<boolean>,
) => runner;

export const createLoopRunner = <LOOP extends Loop>(
  runner: (data: {
    log: typeof console.log;
    setOutput: SetOutputLoopFn<LOOP>;
    inputs: ExtractInputsFromLoop<LOOP>;
    setMeta: (callback: (data: LOOP["meta"]) => LOOP["meta"]) => void;
    meta: LOOP["meta"];
    cwd: string;
    context: PipelabContext;
  }) => Promise<"step" | "exit">,
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
