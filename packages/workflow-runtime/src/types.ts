export const WORKFLOW_VERSION = 1;

export interface Workflow {
  version: number;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  uses: string;
  /** Steps that must complete before this step can start. */
  needs?: string[];
  with?: Record<string, unknown>;
}

export interface Workspace {
  root: string;
}

export interface FileSystem {
  ensureDirectory(path: string): Promise<void>;
}

export interface ProcessExecutionOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  signal: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface ProcessExecutor {
  execute(
    command: string,
    args: string[],
    options: ProcessExecutionOptions,
  ): Promise<ProcessResult>;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type WorkflowLogStream = "stdout" | "stderr";

export interface WorkflowArtifact {
  name: string;
  path: string;
}

export interface WorkflowTaskContext {
  step: WorkflowStep;
  inputs: Record<string, unknown>;
  workspace: Workspace;
  filesystem: FileSystem;
  processes: ProcessExecutor;
  logger: Logger;
  signal: AbortSignal;
  log(...args: unknown[]): void;
  logStream(stream: WorkflowLogStream, ...args: unknown[]): void;
  setArtifact(name: string, path: string): void;
}

export type WorkflowTask = (
  context: WorkflowTaskContext,
) => Promise<Record<string, unknown> | void>;

export type WorkflowTaskRegistry = Record<string, WorkflowTask>;

export interface WorkflowError {
  name: string;
  message: string;
}

export interface WorkflowStepResult {
  id: string;
  uses: string;
  outputs: Record<string, unknown>;
  artifacts: WorkflowArtifact[];
  startedAt: number;
  completedAt: number;
  duration: number;
}

export interface WorkflowResult {
  outputs: Record<string, Record<string, unknown>>;
  artifacts: WorkflowArtifact[];
  steps: Record<string, WorkflowStepResult>;
}

export type WorkflowEventInput =
  | {
      type: "workflow.started";
      workflow: Workflow;
    }
  | {
      type: "step.started";
      stepId: string;
      uses: string;
    }
  | {
      type: "step.log";
      stepId: string;
      stream: WorkflowLogStream;
      message: string;
    }
  | {
      type: "step.completed";
      stepId: string;
      uses: string;
      outputs: Record<string, unknown>;
      artifacts: WorkflowArtifact[];
      duration: number;
    }
  | {
      type: "step.failed";
      stepId: string;
      uses: string;
      error: WorkflowError;
      duration: number;
    }
  | {
      type: "workflow.completed";
      result: WorkflowResult;
      duration: number;
    }
  | {
      type: "workflow.failed";
      error: WorkflowError;
      duration: number;
    };

export type WorkflowEvent = WorkflowEventInput & { timestamp: number };

export interface WorkflowRunContext {
  host: WorkflowHost;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  tasks?: WorkflowTaskRegistry;
  onEvent?: (event: WorkflowEvent) => void;
}

export interface WorkflowHost {
  workspace: Workspace;
  filesystem: FileSystem;
  processes: ProcessExecutor;
  logger: Logger;
}
