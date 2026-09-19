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
