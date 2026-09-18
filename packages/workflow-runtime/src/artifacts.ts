import type { ArtifactOutputDefinition, WorkflowArtifactOutputId } from "@pipelab/constants";

export type ArtifactOutputId = WorkflowArtifactOutputId;

export {
  ARTIFACT_OUTPUTS,
  DESTINATIONS,
  PACKAGERS,
  PACKAGER_DEFINITIONS,
  SERVICE_DEFINITIONS,
} from "@pipelab/constants";
export type {
  ArtifactOutputDescriptor,
  ArtifactOutputDefinition,
  DestinationDefinition,
  PackagerDefinition,
  WorkflowArtifactOutputId,
  WorkflowPackagerDefinitionId,
  WorkflowServiceId,
} from "@pipelab/constants";

export interface ArtifactInstance {
  readonly id: string;
  readonly outputId: WorkflowArtifactOutputId;
  readonly version: string;
  readonly platform: ArtifactOutputDefinition["platform"];
  readonly architecture: ArtifactOutputDefinition["architecture"];
  readonly format: ArtifactOutputDefinition["format"];
  readonly path: string;
  readonly cloud?: {
    readonly hostedArtifactId: string;
    readonly uploadedAt: string;
  };
  readonly producerStep: string;
  readonly checksum?: string;
  readonly size?: number;
}
