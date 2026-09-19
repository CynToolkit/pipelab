import type { ArtifactDescriptor } from "@pipelab/shared";

export interface WorkflowArtifactInstance {
  readonly id: string;
  readonly descriptor: ArtifactDescriptor;
  readonly version?: string;
  readonly path: string;
  readonly stepId: string;
  readonly artifact: string;
  readonly cloud?: {
    readonly hostedArtifactId: string;
    readonly uploadedAt: string;
  };
  readonly checksum?: string;
  readonly size?: number;
  readonly [key: string]: unknown;
}

export type ArtifactInstance = WorkflowArtifactInstance;
