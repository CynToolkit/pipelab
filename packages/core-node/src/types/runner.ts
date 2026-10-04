import type { BrowserWindow } from "electron";
import type { PipelabContext } from "../context";
import type { Action, SetOutputActionFn, ExtractInputsFromAction } from "@pipelab/shared";

export type { Action, SetOutputActionFn, ExtractInputsFromAction };

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
  /** @deprecated Use `context` instead to resolve sandboxed folders and binary paths. */
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
  setArtifact: (name: string, path: string) => void;
};

export type ActionRunner<ACTION extends Action> = (data: ActionRunnerData<ACTION>) => Promise<void>;
