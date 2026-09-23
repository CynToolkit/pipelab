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
  projectPath?: string;
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const parseError = (value: unknown, path: string): void => {
  if (!isRecord(value) || !isNonEmptyString(value.message) || typeof value.timestamp !== "number")
    throw new BuildHistoryParseError(path, "error has an invalid shape");
  if (value.stack !== undefined && typeof value.stack !== "string")
    throw new BuildHistoryParseError(`${path}.stack`, "must be a string");
  if (value.code !== undefined && typeof value.code !== "string")
    throw new BuildHistoryParseError(`${path}.code`, "must be a string");
};

const parseLog = (value: unknown, path: string): void => {
  const levels = ["debug", "info", "warn", "error"];
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    typeof value.timestamp !== "number" ||
    typeof value.message !== "string" ||
    typeof value.level !== "string" ||
    !levels.includes(value.level)
  )
    throw new BuildHistoryParseError(path, "log has an invalid shape");
  if (value.source !== undefined && typeof value.source !== "string")
    throw new BuildHistoryParseError(`${path}.source`, "must be a string");
  if (value.data !== undefined && !isRecord(value.data))
    throw new BuildHistoryParseError(`${path}.data`, "must be an object");
};

const parseArtifactDescriptor = (value: unknown, path: string): void => {
  if (
    !isRecord(value) ||
    !["project", "application", "files"].includes(String(value.kind)) ||
    !["file", "directory", "archive"].includes(String(value.container))
  )
    throw new BuildHistoryParseError(path, "has an invalid shape");
  if (
    value.capabilities !== undefined &&
    (!Array.isArray(value.capabilities) ||
      value.capabilities.some((capability) => typeof capability !== "string"))
  )
    throw new BuildHistoryParseError(`${path}.capabilities`, "must be an array of strings");
};

const parseArtifactCloud = (value: unknown, path: string): void => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.hostedArtifactId) ||
    !isNonEmptyString(value.uploadedAt)
  )
    throw new BuildHistoryParseError(path, "has an invalid hosted-artifact shape");
};

const parseArtifact = (value: unknown, path: string): void => {
  if (!isRecord(value)) throw new BuildHistoryParseError(path, "artifact must be an object");

  // Legacy persisted artifacts have a human-readable name and file type, but
  // no runtime step/artifact reference. Runtime artifacts are identified by
  // their descriptor and require those execution references.
  const isRuntimeArtifact =
    value.descriptor !== undefined &&
    isNonEmptyString(value.stepId) &&
    isNonEmptyString(value.artifact);
  if (isRuntimeArtifact) {
    if (
      !isNonEmptyString(value.id) ||
      !isNonEmptyString(value.path) ||
      !isNonEmptyString(value.stepId) ||
      !isNonEmptyString(value.artifact)
    )
      throw new BuildHistoryParseError(
        path,
        "runtime artifact requires id, path, stepId, and artifact",
      );
    parseArtifactDescriptor(value.descriptor, `${path}.descriptor`);
  } else if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.path) ||
    typeof value.size !== "number" ||
    !["file", "folder"].includes(String(value.type))
  ) {
    throw new BuildHistoryParseError(
      path,
      "legacy artifact requires id, name, path, size, and type",
    );
  }
  if (!isRuntimeArtifact && value.descriptor !== undefined)
    parseArtifactDescriptor(value.descriptor, `${path}.descriptor`);
  for (const key of ["version", "stepId", "artifact", "checksum"])
    if (value[key] !== undefined && typeof value[key] !== "string")
      throw new BuildHistoryParseError(`${path}.${key}`, "must be a string");
  if (value.size !== undefined && typeof value.size !== "number")
    throw new BuildHistoryParseError(`${path}.size`, "must be a number");
  if (value.cloud !== undefined) parseArtifactCloud(value.cloud, `${path}.cloud`);
};

const assertEntry: (value: unknown, path: string) => asserts value is BuildHistoryEntry = (
  value,
  path,
) => {
  if (!isRecord(value)) throw new BuildHistoryParseError(path, "run entry must be an object");
  for (const key of ["id", "pipelineId"])
    if (!isNonEmptyString(value[key]))
      throw new BuildHistoryParseError(`${path}.${key}`, "must be a string");
  if (typeof value.projectName !== "string")
    throw new BuildHistoryParseError(`${path}.projectName`, "must be a string");
  if (value.projectPath !== undefined && typeof value.projectPath !== "string")
    throw new BuildHistoryParseError(`${path}.projectPath`, "must be a string");
  for (const key of ["workflowId", "workflowName", "cachePath", "version", "userId"])
    if (value[key] !== undefined && typeof value[key] !== "string")
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
    if (!isRecord(step) || !isNonEmptyString(step.id) || !isNonEmptyString(step.name))
      throw new BuildHistoryParseError(`${path}.steps.${index}`, "step requires id and name");
    if (typeof step.status !== "string" || !stepStatuses.includes(step.status))
      throw new BuildHistoryParseError(`${path}.steps.${index}.status`, "has an unsupported value");
    if (typeof step.startTime !== "number" || !Array.isArray(step.logs))
      throw new BuildHistoryParseError(
        `${path}.steps.${index}`,
        "step requires numeric startTime and logs array",
      );
    if (step.endTime !== undefined && typeof step.endTime !== "number")
      throw new BuildHistoryParseError(`${path}.steps.${index}.endTime`, "must be a number");
    if (step.duration !== undefined && typeof step.duration !== "number")
      throw new BuildHistoryParseError(`${path}.steps.${index}.duration`, "must be a number");
    if (step.error !== undefined) parseError(step.error, `${path}.steps.${index}.error`);
    step.logs.forEach((log, logIndex) => parseLog(log, `${path}.steps.${index}.logs.${logIndex}`));
  });
  value.logs.forEach((log, index) => parseLog(log, `${path}.logs.${index}`));
  if (value.error !== undefined) parseError(value.error, `${path}.error`);
  if (value.artifacts !== undefined) {
    if (!Array.isArray(value.artifacts))
      throw new BuildHistoryParseError(`${path}.artifacts`, "must be an array");
    value.artifacts.forEach((artifact, index) => {
      parseArtifact(artifact, `${path}.artifacts.${index}`);
    });
  }
  if (value.deliveries !== undefined) {
    if (!Array.isArray(value.deliveries))
      throw new BuildHistoryParseError(`${path}.deliveries`, "must be an array");
    value.deliveries.forEach((delivery, index) => {
      if (
        !isRecord(delivery) ||
        !isNonEmptyString(delivery.id) ||
        !isNonEmptyString(delivery.destinationId) ||
        !isNonEmptyString(delivery.slotId) ||
        !isNonEmptyString(delivery.artifactId) ||
        !["completed", "failed"].includes(String(delivery.status)) ||
        typeof delivery.startedAt !== "number" ||
        typeof delivery.completedAt !== "number" ||
        typeof delivery.duration !== "number"
      )
        throw new BuildHistoryParseError(
          `${path}.deliveries.${index}`,
          "delivery has an invalid shape",
        );
      if (delivery.serviceId !== undefined && typeof delivery.serviceId !== "string")
        throw new BuildHistoryParseError(
          `${path}.deliveries.${index}.serviceId`,
          "must be a string",
        );
      if (delivery.destinationName !== undefined && typeof delivery.destinationName !== "string")
        throw new BuildHistoryParseError(
          `${path}.deliveries.${index}.destinationName`,
          "must be a string",
        );
      if (delivery.error !== undefined && typeof delivery.error !== "string")
        throw new BuildHistoryParseError(`${path}.deliveries.${index}.error`, "must be a string");
    });
  }
};

const parseEntry = (value: unknown, path: string): BuildHistoryEntry => {
  assertEntry(value, path);
  return value;
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
