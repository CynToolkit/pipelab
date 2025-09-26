export type NodeId = string // keyof typeof nodes

export interface Pipeline {
  id: string;
  status: string;
  steps: PipelineStep[];
  artifacts: PipelineArtifact[];
}

export interface PipelineStep {
  id: string;
  name: string;
  status: string;
  logs: string;
  artifacts: PipelineArtifact[];
}

export interface PipelineArtifact {
  id: string;
  name: string;
  url: string;
}
