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
  /** Ordered, serializable progress phases reported by the task at runtime. */
  phases?: readonly WorkflowPhaseDefinition[];
}

export interface WorkflowPhaseDefinition {
  id: string;
  title: string;
}

/** Preserve a phase catalog's literal IDs so task calls can be checked by TypeScript. */
export const definePhases = <const T extends readonly WorkflowPhaseDefinition[]>(phases: T): T =>
  phases;

export type PhaseIds<T extends readonly WorkflowPhaseDefinition[]> = T[number]["id"];

export type WorkflowPhaseStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed"
  | "not-reached"
  | "not-reported";

export interface WorkflowPhaseResult extends WorkflowPhaseDefinition {
  status: WorkflowPhaseStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  message?: string;
  error?: WorkflowError;
  warnings: string[];
}

export type WorkflowPhaseOutcome =
  | { status: "completed"; message?: string }
  | { status: "skipped"; reason: string };

export interface WorkflowPhaseTools {
  skip(reason: string): WorkflowPhaseOutcome;
  success(message?: string): WorkflowPhaseOutcome;
  fail(errorOrMessage: unknown): never;
  warn(message: string): void;
}

export interface WorkflowPhaseRunner<Id extends string> {
  phase(
    id: Id,
    callback: (
      tools: WorkflowPhaseTools,
    ) => WorkflowPhaseOutcome | void | Promise<WorkflowPhaseOutcome | void>,
  ): Promise<void>;
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
  shell?: boolean | string;
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
  /** Connection fields resolved for this run, keyed by stable workflow alias. */
  connectionValues: WorkflowConnectionValues;
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
  withPhases<const T extends readonly WorkflowPhaseDefinition[]>(
    phases: T,
  ): WorkflowPhaseRunner<PhaseIds<T>>;
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

export type WorkflowConnectionValues = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type WorkflowConnectionOverrideValue =
  | { kind: "environment"; name: string }
  | { kind: "literal"; value: string };

export interface WorkflowConnectionOverride {
  alias: string;
  field: string;
  value: WorkflowConnectionOverrideValue;
}

export interface WorkflowConnectionRequirement {
  alias: string;
  required: boolean;
  fields: readonly { key: string; required: boolean }[];
  providerId?: string;
  integrationName?: string;
}

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
  phases?: WorkflowPhaseResult[];
  diagnostics?: string[];
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
      type: "phase.started";
      stepId: string;
      phaseId: string;
      title: string;
    }
  | {
      type: "phase.completed";
      stepId: string;
      phaseId: string;
      message?: string;
      duration: number;
    }
  | {
      type: "phase.skipped";
      stepId: string;
      phaseId: string;
      reason: string;
      duration: number;
    }
  | {
      type: "phase.failed";
      stepId: string;
      phaseId: string;
      error: WorkflowError;
      duration: number;
    }
  | {
      type: "phase.warning";
      stepId: string;
      phaseId: string;
      message: string;
      diagnostic?: boolean;
    }
  | {
      type: "phase.not-reached" | "phase.not-reported";
      stepId: string;
      phaseId: string;
      title: string;
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
  env?: WorkflowEnvironment;
  /** Locally bound Desktop values, or any other host-provided run values. */
  connectionValues?: WorkflowConnectionValues;
  /** Explicit per-run values, such as CLI --connection overrides. */
  connectionOverrides?: readonly WorkflowConnectionOverride[];
  /** Provider-declared Connection fields required by this workflow run. */
  connectionRequirements?: readonly WorkflowConnectionRequirement[];
  /** Required ordinary workflow properties bound to environment variables. */
  requiredEnvironmentVariables?: readonly string[];
  signal?: AbortSignal;
  tasks?: WorkflowTaskRegistry<TServices>;
  services?: TServices;
  onEvent?: (event: WorkflowEvent) => void;
}

/** Environment values supplied for one workflow run. */
export type WorkflowEnvironment = Readonly<Record<string, string | undefined>>;

export interface WorkflowHost {
  workspace: Workspace;
  filesystem: FileSystem;
  processes: ProcessExecutor;
  logger: Logger;
}
