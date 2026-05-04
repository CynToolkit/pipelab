import type { BrowserWindow } from "electron";
import type { PipelabContext } from "../context";
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

export type {
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
};

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
    cache: string;
    pnpm: string;
    node: string;
    userData: string;
    modules: string;
    thirdparty: string;
  };
  browserWindow: BrowserWindow;
  abortSignal: AbortSignal;
  context: PipelabContext;
};

export type ActionRunner<ACTION extends Action> = (data: ActionRunnerData<ACTION>) => Promise<void>;

export type ConditionRunner<CONDITION extends Condition> = (data: {
  log: typeof console.log;
  inputs: ExtractInputsFromCondition<CONDITION>;
  setMeta: (callback: (data: CONDITION["meta"]) => CONDITION["meta"]) => void;
  meta: CONDITION["meta"];
  cwd: string;
  context: PipelabContext;
}) => Promise<boolean>;

export type LoopRunner<LOOP extends Loop> = (data: {
  log: typeof console.log;
  setOutput: SetOutputLoopFn<LOOP>;
  inputs: ExtractInputsFromLoop<LOOP>;
  setMeta: (callback: (data: LOOP["meta"]) => LOOP["meta"]) => void;
  meta: LOOP["meta"];
  cwd: string;
  context: PipelabContext;
}) => Promise<"step" | "exit">;

export type ExpressionRunner<EXPRESSION extends Expression> = (data: {
  log: typeof console.log;
  setOutput: SetOutputExpressionFn<EXPRESSION>;
  inputs: ExtractInputsFromExpression<EXPRESSION>;
  setMeta: (callback: (data: EXPRESSION["meta"]) => EXPRESSION["meta"]) => void;
  meta: EXPRESSION["meta"];
  cwd: string;
  context: PipelabContext;
}) => Promise<string>;

export type EventRunner<EVENT extends Event> = (data: {
  log: typeof console.log;
  inputs: ExtractInputsFromEvent<EVENT>;
  setMeta: (callback: (data: EVENT["meta"]) => EVENT["meta"]) => void;
  meta: EVENT["meta"];
  cwd: string;
  context: PipelabContext;
}) => Promise<void>;

export type Runner = ActionRunner<any> | LoopRunner<any> | EventRunner<any> | ConditionRunner<any>;
