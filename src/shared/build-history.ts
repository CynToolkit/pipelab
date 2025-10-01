// Build History Storage Types and Interfaces

export interface ExecutionStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  duration?: number
  logs: LogEntry[]
  error?: ExecutionError
  output?: Record<string, unknown>
}

export interface ExecutionError {
  message: string
  stack?: string
  code?: string
  timestamp: number
}

export interface LogEntry {
  id: string
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  source?: string
  data?: Record<string, unknown>
}

export interface BuildHistoryEntry {
  id: string
  projectId: string
  projectName: string
  projectPath: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  duration?: number
  steps: ExecutionStep[]
  totalSteps: number
  completedSteps: number
  failedSteps: number
  cancelledSteps: number
  logs: LogEntry[]
  error?: ExecutionError
  output?: Record<string, unknown>
  metadata?: Record<string, unknown>
  userId?: string
  createdAt: number
  updatedAt: number
}

// Simplified query interface - just pipeline filtering
export interface BuildHistoryQuery {
  pipelineId?: string
}

export interface BuildHistoryResponse {
  entries: BuildHistoryEntry[]
  total: number
}

// Storage interfaces - Simplified for pipeline-specific storage
export interface IBuildHistoryStorage {
  save(entry: BuildHistoryEntry): Promise<void>
  get(id: string): Promise<BuildHistoryEntry | undefined>
  getAll(): Promise<BuildHistoryEntry[]>
  getByPipeline(pipelineId: string): Promise<BuildHistoryEntry[]>
  update(id: string, updates: Partial<BuildHistoryEntry>): Promise<void>
  delete(id: string): Promise<void>
  deleteByProject(projectId: string): Promise<void>
  clear(): Promise<void>
  getStorageInfo(): Promise<{
    totalEntries: number
    totalSize: number
    oldestEntry?: number
    newestEntry?: number
  }>
}

// Global index for fast lookups
export interface BuildHistoryIndex {
  version: string
  lastUpdated: number
  entries: Record<
    string,
    {
      id: string
      projectId: string
      projectName: string
      status: BuildHistoryEntry['status']
      startTime: number
      endTime?: number
      createdAt: number
    }
  >
  projects: Record<
    string,
    {
      id: string
      name: string
      lastBuild?: number
      totalBuilds: number
    }
  >
}

// Retention policy configuration
export interface RetentionPolicy {
  enabled: boolean
  maxEntries: number
  maxAge: number // in milliseconds
  maxSize: number // in bytes
  keepFailedBuilds: boolean
  keepSuccessfulBuilds: boolean
}

// Storage configuration
export interface BuildHistoryConfig {
  storagePath: string
  indexFileName: string
  entryFilePrefix: string
  retentionPolicy: RetentionPolicy
}

// Authorization and subscription types
export interface SubscriptionBenefit {
  id: string
  name: string
  description?: string
}

export interface SubscriptionError extends Error {
  code: 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED' | 'BENEFIT_NOT_FOUND' | 'UNAUTHORIZED'
  benefit?: string
  userMessage: string
}

export interface AuthorizationContext {
  userId?: string
  hasBenefit: (benefitId: string) => boolean
  isPaidUser: boolean
}

// Authorization check function type
export type AuthorizationCheck = (context: AuthorizationContext) => void
