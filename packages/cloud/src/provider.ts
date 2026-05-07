export interface CloudRun {
  id: string;
  providerId: string;
  status: "initializing" | "running" | "success" | "failed";
  startTime: number;
}

export interface CloudRunOptions {
  os: "windows" | "linux" | "macos";
  cpu?: number;
  memoryInGB?: number;
  cloudRunId?: string;
  [key: string]: any;
}

export interface CloudProvider {
  id: string;
  name: string;
  supportedOS: ("windows" | "linux" | "macos")[];

  /** Trigger a new run */
  run(pipeline: any, options: CloudRunOptions): Promise<CloudRun>;

  /** Get current logs (for polling or initialization) */
  getLogs(runId: string): Promise<string[]>;

  /** Cleanup resources */
  cleanup(runId: string): Promise<void>;
}
