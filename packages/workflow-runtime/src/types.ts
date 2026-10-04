import type { ArtifactDescriptor, WorkflowArtifactInstance } from "./artifacts";
export type { ArtifactDescriptor, ArtifactKind, WorkflowArtifactInstance } from "./artifacts";

export const WORKFLOW_VERSION = 1;

export interface Workflow {
  version: number;
  steps: readonly WorkflowStep[];
  continueOnError?: boolean;
}

export interface WorkflowStep {
  id: string;
  uses: string;
  /** Steps that must complete before this step can start. */
  needs?: readonly string[];
  with?: Record<string, unknown>;
  artifacts?: Record<string, WorkflowArtifactDefinition>;
  artifactInputs?: Record<string, WorkflowArtifactReference>;
  delivery?: WorkflowDeliveryDefinition;
}

export interface WorkflowArtifactDefinition {
  descriptor: ArtifactDescriptor;
}

export interface WorkflowArtifactReference {
  stepId: string;
  artifact: string;
}

export interface WorkflowDeliveryDefinition {
  destinationId: string;
  slotId: string;
  artifact: WorkflowArtifactReference;
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

export interface WorkflowTaskContext<TServices = unknown> {
  step: WorkflowStep;
  inputs: Record<string, unknown>;
  /** Outputs already produced by steps in this workflow run. */
  outputs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Artifacts already produced by steps in this workflow run. */
  artifacts: readonly (WorkflowArtifact | WorkflowArtifactInstance)[];
  /** Host-provided services for plugin tasks. */
  services: TServices;
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

export type WorkflowTask<TServices = unknown> = (
  context: WorkflowTaskContext<TServices>,
) => Promise<Record<string, unknown> | void>;

export type WorkflowTaskRegistry<TServices = unknown> = Record<string, WorkflowTask<TServices>>;

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

export interface WorkflowRunContext<TServices = unknown> {
  host: WorkflowHost;
  version?: string;
  buildId?: string;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  tasks?: WorkflowTaskRegistry<TServices>;
  services?: TServices;
  onEvent?: (event: WorkflowEvent) => void;
}

export interface WorkflowHost {
  workspace: Workspace;
  filesystem: FileSystem;
  processes: ProcessExecutor;
  logger: Logger;
}
