export type ArtifactKind = "project" | "application" | "archive";

export interface ArtifactDescriptor {
  kind: ArtifactKind;
  technology?: string;
  platform?: string;
  architecture?: string;
  format?: string;
  capabilities?: string[];
}

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
