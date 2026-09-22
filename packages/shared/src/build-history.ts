// Build History Storage Types and Interfaces
import { SandboxFolder } from "@pipelab/constants";
import type {
  ArtifactInstance as WorkflowArtifactInstance,
  WorkflowDeliveryResult,
} from "@pipelab/workflow-runtime";
import type { ArtifactDescriptor } from "./release/types";

export interface ExecutionStep {
  id: string;
  name: string;
  uses?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  startTime: number;
  endTime?: number;
  duration?: number;
  logs: LogEntry[];
  error?: ExecutionError;
  output?: Record<string, unknown>;
  destinationId?: string;
  serviceId?: string;
  destinationName?: string;
  slotId?: string;
  artifact?: string;
}

export interface ExecutionError {
  message: string;
  stack?: string;
  code?: string;
  timestamp: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  source?: string;
  data?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  name: string;
  path: string;
  size: number;
  type: "file" | "folder";
  descriptor?: ArtifactDescriptor;
  version?: string;
  stepId?: string;
  artifact?: string;
  checksum?: string;
  cloud?: {
    hostedArtifactId: string;
    uploadedAt: string;
  };
}

export interface BuildHistoryEntry {
  id: string;
  pipelineId: string;
  workflowId?: string;
  workflowName?: string;
  projectName: string;
  projectPath: string;
  cachePath?: string;
  status: "running" | "completed" | "completed-with-errors" | "failed" | "cancelled";
  version?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  steps: ExecutionStep[];
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  cancelledSteps: number;
  logs: LogEntry[];
  error?: ExecutionError;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  artifacts?: Array<Artifact | WorkflowArtifactInstance>;
  deliveries?: WorkflowDeliveryResult[];
}

export const BUILD_HISTORY_VERSION = "1.0.0" as const;
export interface BuildHistoryDocument {
  version: typeof BUILD_HISTORY_VERSION;
  entries: BuildHistoryEntry[];
}

export class BuildHistoryParseError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "BuildHistoryParseError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseEntry = (value: unknown, path: string): BuildHistoryEntry => {
  if (!isRecord(value)) throw new BuildHistoryParseError(path, "run entry must be an object");
  for (const key of ["id", "pipelineId", "projectName", "projectPath"])
    if (typeof value[key] !== "string")
      throw new BuildHistoryParseError(`${path}.${key}`, "must be a string");
  if (
    typeof value.status !== "string" ||
    !["running", "completed", "completed-with-errors", "failed", "cancelled"].includes(value.status)
  )
    throw new BuildHistoryParseError(`${path}.status`, "has an unsupported value");
  for (const key of [
    "startTime",
    "totalSteps",
    "completedSteps",
    "failedSteps",
    "cancelledSteps",
    "createdAt",
    "updatedAt",
  ])
    if (typeof value[key] !== "number")
      throw new BuildHistoryParseError(`${path}.${key}`, "must be a number");
  if (!Array.isArray(value.steps) || !Array.isArray(value.logs))
    throw new BuildHistoryParseError(path, "steps and logs must be arrays");
  const stepStatuses = ["pending", "running", "completed", "failed", "cancelled", "skipped"];
  value.steps.forEach((step, index) => {
    if (!isRecord(step) || typeof step.id !== "string" || typeof step.name !== "string")
      throw new BuildHistoryParseError(`${path}.steps.${index}`, "step requires id and name");
    if (typeof step.status !== "string" || !stepStatuses.includes(step.status))
      throw new BuildHistoryParseError(`${path}.steps.${index}.status`, "has an unsupported value");
    if (typeof step.startTime !== "number" || !Array.isArray(step.logs))
      throw new BuildHistoryParseError(
        `${path}.steps.${index}`,
        "step requires numeric startTime and logs array",
      );
  });
  const logLevels = ["debug", "info", "warn", "error"];
  value.logs.forEach((log, index) => {
    if (
      !isRecord(log) ||
      typeof log.id !== "string" ||
      typeof log.timestamp !== "number" ||
      typeof log.message !== "string" ||
      typeof log.level !== "string" ||
      !logLevels.includes(log.level)
    )
      throw new BuildHistoryParseError(`${path}.logs.${index}`, "log has an invalid shape");
  });
  if (value.artifacts !== undefined) {
    if (!Array.isArray(value.artifacts))
      throw new BuildHistoryParseError(`${path}.artifacts`, "must be an array");
    value.artifacts.forEach((artifact, index) => {
      if (!isRecord(artifact))
        throw new BuildHistoryParseError(
          `${path}.artifacts.${index}`,
          "artifact must be an object",
        );
      if (
        typeof artifact.id !== "string" ||
        typeof artifact.path !== "string" ||
        typeof artifact.stepId !== "string" ||
        typeof artifact.artifact !== "string"
      )
        throw new BuildHistoryParseError(
          `${path}.artifacts.${index}`,
          "artifact requires id, path, stepId, and artifact",
        );
      if (
        !isRecord(artifact.descriptor) ||
        typeof artifact.descriptor.kind !== "string" ||
        typeof artifact.descriptor.container !== "string"
      )
        throw new BuildHistoryParseError(
          `${path}.artifacts.${index}.descriptor`,
          "has an invalid shape",
        );
      if (artifact.size !== undefined && typeof artifact.size !== "number")
        throw new BuildHistoryParseError(`${path}.artifacts.${index}.size`, "must be a number");
      if (
        artifact.cloud !== undefined &&
        (!isRecord(artifact.cloud) ||
          typeof artifact.cloud.hostedArtifactId !== "string" ||
          typeof artifact.cloud.uploadedAt !== "string")
      )
        throw new BuildHistoryParseError(
          `${path}.artifacts.${index}.cloud`,
          "has an invalid hosted-artifact shape",
        );
    });
  }
  if (value.deliveries !== undefined && !Array.isArray(value.deliveries))
    throw new BuildHistoryParseError(`${path}.deliveries`, "must be an array");
  return value as unknown as BuildHistoryEntry;
};

export const parseBuildHistoryDocument = (value: unknown): BuildHistoryDocument => {
  if (Array.isArray(value))
    return {
      version: BUILD_HISTORY_VERSION,
      entries: value.map((entry, index) => parseEntry(entry, `entries.${index}`)),
    };
  if (!isRecord(value) || value.version !== BUILD_HISTORY_VERSION || !Array.isArray(value.entries))
    throw new BuildHistoryParseError("history", "unsupported version or invalid document");
  return {
    version: BUILD_HISTORY_VERSION,
    entries: value.entries.map((entry, index) => parseEntry(entry, `entries.${index}`)),
  };
};

// Query interface supporting both pipeline and scenario filtering
export interface BuildHistoryQuery {
  pipelineId?: string;
  workflowId?: string;
}

export interface BuildHistoryResponse {
  entries: BuildHistoryEntry[];
  total: number;
}

// Storage interfaces - Simplified for pipeline-specific storage
export interface IBuildHistoryStorage {
  save(entry: BuildHistoryEntry): Promise<void>;
  get(id: string, pipelineId?: string): Promise<BuildHistoryEntry | undefined>;
  getAll(): Promise<BuildHistoryEntry[]>;
  getByPipeline(pipelineId: string): Promise<BuildHistoryEntry[]>;
  update(id: string, updates: Partial<BuildHistoryEntry>, pipelineId?: string): Promise<void>;
  delete(id: string, pipelineId?: string): Promise<void>;
  clear(): Promise<void>;
  getStorageInfo(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: number;
    newestEntry?: number;
    numberOfPipelines: number;
    userDataPath: string;
    disk: {
      total: number;
      free: number;
      pipelab: number;
      folders: Array<{ name: SandboxFolder; label: string; size: number }>;
    };
  }>;
}

// Authorization and subscription types
export interface SubscriptionBenefit {
  id: string;
  name: string;
  description?: string;
}

export interface SubscriptionError extends Error {
  code: "SUBSCRIPTION_REQUIRED" | "SUBSCRIPTION_EXPIRED" | "BENEFIT_NOT_FOUND" | "UNAUTHORIZED";
  benefit?: string;
  userMessage: string;
}

export interface AuthorizationContext {
  userId?: string;
  hasBenefit: (benefitId: string) => boolean;
  isPaidUser: boolean;
}

// Authorization check function type
export type AuthorizationCheck = (context: AuthorizationContext) => void;
