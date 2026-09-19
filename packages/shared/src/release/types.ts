import type { ArtifactDescriptor, WorkflowStep } from "@pipelab/workflow-runtime";
import type { IconType } from "../plugins/definitions";

export type { ArtifactDescriptor, ArtifactKind } from "@pipelab/workflow-runtime";

export interface ArtifactConstraint {
  kind?: string | string[];
  technology?: string | string[];
  platform?: string | string[];
  architecture?: string | string[];
  container?: "file" | "directory" | "archive" | Array<"file" | "directory" | "archive">;
  format?: string | string[];
  capabilities?: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
}

export interface ReleaseSourceConfig {
  provider: string;
  config: Record<string, unknown>;
}

export interface ReleaseProducerTarget {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ReleaseProducerConfig {
  id: string;
  provider: string;
  enabled: boolean;
  targets: ReleaseProducerTarget[];
  config: Record<string, unknown>;
}

export interface ReleaseDestinationSlot {
  id: string;
  enabled: boolean;
  input: { producerId: string; outputId: string };
  config: Record<string, unknown>;
}

export interface ReleaseDestinationConfig {
  id: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
  slots: ReleaseDestinationSlot[];
}

export interface ReleaseConfig {
  version: "3.0.0";
  id: string;
  project: string;
  name: string;
  description?: string;
  integration?: string;
  source: ReleaseSourceConfig;
  producers: ReleaseProducerConfig[];
  destinations: ReleaseDestinationConfig[];
  continueOnError?: boolean;
}

export interface CompiledArtifactReference {
  stepId: string;
  artifact: string;
}

export interface CompiledArtifact {
  reference: CompiledArtifactReference;
  descriptor: ArtifactDescriptor;
}

export interface CompiledSource {
  steps: WorkflowStep[];
  artifact: CompiledArtifact;
}

export interface CompiledProducer {
  steps: WorkflowStep[];
  artifacts: Record<string, CompiledArtifact>;
}

export interface ReleaseHostContext {
  platform: string;
  architecture: string;
  [key: string]: unknown;
}

export interface ReleaseHostCapabilities {
  host: ReleaseHostContext;
}

export interface ReleaseProviderContext {
  host: ReleaseHostContext;
  [key: string]: unknown;
}

export interface ReleaseCompileContext extends ReleaseProviderContext {
  variables?: Record<string, unknown>;
}

export interface ReleaseValidationContext extends ReleaseProviderContext {
  source?: ArtifactDescriptor;
}

export interface Availability {
  available: boolean;
  reason?: string;
}

export interface ReleaseFieldDefinition {
  key: string;
  type: "text" | "password" | "number" | "directory" | "file" | "select" | "connection";
  label: string;
  description?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface SourceInspection {
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
  fieldOptions?: Record<string, Array<{ label: string; value: string }>>;
  fieldValues?: Record<string, unknown>;
  issues: ValidationIssue[];
}

export interface ProducerInspection {
  data?: Record<string, unknown>;
  fieldOptions?: Record<string, Array<{ label: string; value: string }>>;
  fieldValues?: Record<string, unknown>;
  issues: ValidationIssue[];
}

export interface ReleaseSourceDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  output: ArtifactDescriptor;
  createDefaultConfig(): Record<string, unknown>;
  validate(config: Record<string, unknown>): ValidationIssue[];
  inspect?(config: Record<string, unknown>, context: ReleaseProviderContext): Promise<SourceInspection>;
  compile(config: Record<string, unknown>, context: ReleaseCompileContext): CompiledSource;
}

export interface ReleaseProducerTargetDefinition {
  id: string;
  label: string;
  output: ArtifactDescriptor;
  fields?: ReleaseFieldDefinition[];
  createDefaultConfig(): Record<string, unknown>;
  isAvailable?(context: ReleaseHostContext): Availability;
}

export interface ReleaseProducerDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  targets: ReleaseProducerTargetDefinition[];
  createDefaultConfig(): Record<string, unknown>;
  validate(config: ReleaseProducerConfig, context: ReleaseValidationContext): ValidationIssue[];
  inspect?(config: ReleaseProducerConfig, context: ReleaseProviderContext): Promise<ProducerInspection>;
  compile(input: CompiledArtifactReference, config: ReleaseProducerConfig, context: ReleaseCompileContext): CompiledProducer;
}

export interface ReleaseDestinationDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  slotFields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  createDefaultConfig(): Record<string, unknown>;
  validate(config: ReleaseDestinationConfig, context: ReleaseValidationContext): ValidationIssue[];
  compile(artifact: CompiledArtifactReference, destination: ReleaseDestinationConfig, slot: ReleaseDestinationSlot, context: ReleaseCompileContext): WorkflowStep[];
}

export interface PluginReleaseDefinition {
  sources?: ReleaseSourceDefinition[];
  producers?: ReleaseProducerDefinition[];
  destinations?: ReleaseDestinationDefinition[];
}

export interface ReleaseRegistry {
  sources: ReleaseSourceDefinition[];
  producers: ReleaseProducerDefinition[];
  destinations: ReleaseDestinationDefinition[];
}

export interface ReleaseCatalogTarget {
  id: string;
  label: string;
  output: ArtifactDescriptor;
  defaultConfig: Record<string, unknown>;
  fields?: ReleaseFieldDefinition[];
  availability?: Availability;
}

export interface ReleaseCatalogSource {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  output: ArtifactDescriptor;
  defaultConfig: Record<string, unknown>;
}

export interface ReleaseCatalogProducer {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  defaultConfig: Record<string, unknown>;
  targets: ReleaseCatalogTarget[];
}

export interface ReleaseCatalogDestination {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  slotFields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  defaultConfig: Record<string, unknown>;
}

export interface ReleaseCatalog {
  sources: ReleaseCatalogSource[];
  producers: ReleaseCatalogProducer[];
  destinations: ReleaseCatalogDestination[];
}
