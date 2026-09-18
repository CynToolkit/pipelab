import type { WorkflowArtifactOutputId } from "@pipelab/constants";
import type { ArtifactInstance } from "./artifacts";

export const WORKFLOW_VERSION = 1;

export interface Workflow {
  version: number;
  steps: WorkflowStep[];
  continueOnError?: boolean;
}

export interface WorkflowStep {
  id: string;
  uses: string;
  /** Steps that must complete before this step can start. */
  needs?: string[];
  with?: Record<string, unknown>;
  delivery?: WorkflowDeliveryDefinition;
}

export interface WorkflowDeliveryDefinition {
  destinationId: string;
  serviceId?: string;
  destinationName?: string;
  slotId: string;
  artifactOutputId: WorkflowArtifactOutputId;
  producerStep: string;
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

export type WorkflowArtifactInstance = ArtifactInstance;

export interface WorkflowTaskContext {
  step: WorkflowStep;
  inputs: Record<string, unknown>;
  delivery?: WorkflowTaskDeliveryContext;
  workspace: Workspace;
  filesystem: FileSystem;
  processes: ProcessExecutor;
  logger: Logger;
  signal: AbortSignal;
  log(...args: unknown[]): void;
  logStream(stream: WorkflowLogStream, ...args: unknown[]): void;
  setArtifact(
    outputId: string,
    path: string,
    metadata?: { checksum?: string; size?: number; name?: string },
  ): void;
}

export interface WorkflowTaskDeliveryContext {
  destinationId: string;
  slotId: string;
  artifact: WorkflowArtifactInstance;
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
  status: "completed" | "failed" | "skipped";
  outputs: Record<string, unknown>;
  artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>;
  startedAt: number;
  completedAt: number;
  duration: number;
  error?: WorkflowError;
  blockedBy?: string[];
  delivery?: WorkflowDeliveryResult;
}

export interface WorkflowDeliveryResult {
  id: string;
  destinationId: string;
  serviceId?: string;
  destinationName?: string;
  slotId: string;
  producerStep?: string;
  artifactId: string;
  status: "completed" | "failed";
  startedAt: number;
  completedAt: number;
  duration: number;
  error?: string;
}

export interface WorkflowResult {
  status: "completed" | "completed-with-errors";
  version?: string;
  outputs: Record<string, Record<string, unknown>>;
  artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>;
  deliveries: WorkflowDeliveryResult[];
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
      artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>;
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
      type: "step.skipped";
      stepId: string;
      uses: string;
      blockedBy: string[];
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
  version?: string;
  buildId?: string;
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
