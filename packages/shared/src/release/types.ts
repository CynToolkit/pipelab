import type { ArtifactDescriptor, WorkflowStep } from "@pipelab/workflow-runtime";
import type { IconType } from "../plugins/definitions";

export type { ArtifactDescriptor, ArtifactKind } from "@pipelab/workflow-runtime";

export const RELEASE_CONFIG_VERSION = "3.0.0" as const;

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
  input?: ArtifactRef;
}

export type ArtifactRef = { source: true } | { producerId: string; outputId: string };

export type ReleaseOutputRef = { source: true } | { buildId: string; targetId: string };

export interface ReleaseBuildProfileConfig {
  id: string;
  type: string;
  engine: string;
  enabled: boolean;
  input?: ReleaseOutputRef;
  config: Record<string, unknown>;
  targets: ReleaseBuildTargetConfig[];
  name?: string;
}

export interface ReleaseBuildTargetConfig {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ReleaseDestinationSlot {
  id: string;
  name?: string;
  enabled: boolean;
  input?: ReleaseOutputRef;
  config: Record<string, unknown>;
}

export interface ResolvedReleaseDestinationSlot extends Omit<ReleaseDestinationSlot, "input"> {
  input?: ArtifactRef;
}

export interface ResolvedReleaseDestinationConfig extends Omit<ReleaseDestinationConfig, "slots"> {
  slots: ResolvedReleaseDestinationSlot[];
}

export interface ReleaseDestinationConfig {
  id: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
  slots: ReleaseDestinationSlot[];
}

export interface ReleaseConfig {
  version: typeof RELEASE_CONFIG_VERSION;
  id: string;
  project: string;
  name: string;
  description?: string;
  source: ReleaseSourceConfig;
  builds: ReleaseBuildProfileConfig[];
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
  sourceConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReleaseCompileContext extends ReleaseProviderContext {
  variables?: Record<string, unknown>;
}

export interface ReleaseValidationContext extends ReleaseProviderContext {
  source?: ArtifactDescriptor;
  sourceConfig?: Record<string, unknown>;
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
  deferUntilEditor?: boolean;
  integration?: string;
  required?: boolean;
  options?: ReleaseFieldOption[];
  fileExtensions?: string[];
}

export interface ReleaseFieldOption {
  label: string;
  value: string;
  metadata?: Record<string, unknown>;
}

export interface SourceInspection {
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
  fieldOptions?: Record<string, ReleaseFieldOption[]>;
  fieldValues?: Record<string, unknown>;
  issues: ValidationIssue[];
}

export interface ProducerInspection {
  data?: Record<string, unknown>;
  fieldOptions?: Record<string, ReleaseFieldOption[]>;
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
  inspect?(
    config: Record<string, unknown>,
    context: ReleaseProviderContext,
  ): Promise<SourceInspection>;
  compile(config: Record<string, unknown>, context: ReleaseCompileContext): CompiledSource;
}

export interface ReleaseProducerTargetDefinition {
  id: string;
  label: string;
  output?: ArtifactDescriptor;
  transform?: ArtifactDescriptorTransform;
  fields?: ReleaseFieldDefinition[];
  createDefaultConfig(): Record<string, unknown>;
  isAvailable?(context: ReleaseHostContext): Availability;
  buildType?: string;
}

export interface ArtifactDescriptorTransform {
  changes?: Partial<ArtifactDescriptor>;
  remove?: Array<"technology" | "platform" | "architecture" | "format" | "capabilities">;
}

export interface ReleaseProducerDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  planning: ReleaseProducerPlanning;
  targets: ReleaseProducerTargetDefinition[];
  createDefaultConfig(): Record<string, unknown>;
  validate(config: ReleaseProducerConfig, context: ReleaseValidationContext): ValidationIssue[];
  inspect?(
    config: ReleaseProducerConfig,
    context: ReleaseProviderContext,
  ): Promise<ProducerInspection>;
  compile(
    input: CompiledArtifact,
    config: ReleaseProducerConfig,
    context: ReleaseCompileContext,
  ): CompiledProducer;
  acceptsWhen?(artifact: ArtifactDescriptor, context: ReleaseAcceptanceContext): ArtifactAcceptance;
}

export interface ReleaseProducerPlanning {
  mode: "build" | "automatic";
}

export type ArtifactAcceptance = { accepted: true } | { accepted: false; reason?: string };

export interface ReleaseAcceptanceContext extends ReleaseProviderContext {
  producer?: ReleaseProducerDefinition;
  destination?: ReleaseDestinationDefinition;
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
  compile(
    artifact: CompiledArtifact,
    destination: ResolvedReleaseDestinationConfig,
    slot: ResolvedReleaseDestinationSlot,
    context: ReleaseCompileContext,
  ): WorkflowStep[];
  acceptsWhen?(artifact: ArtifactDescriptor, context: ReleaseAcceptanceContext): ArtifactAcceptance;
}

export interface ReleaseBuildTypeDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
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
  buildType?: string;
  output?: ArtifactDescriptor;
  transform?: ArtifactDescriptorTransform;
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
  planning: ReleaseProducerPlanning;
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
  buildTypes: ReleaseBuildTypeDefinition[];
  sources: ReleaseCatalogSource[];
  producers: ReleaseCatalogProducer[];
  destinations: ReleaseCatalogDestination[];
}

export interface PlannedReleaseOutput {
  buildId?: string;
  targetId?: string;
  ref: ReleaseOutputRef;
  artifactRef: ArtifactRef;
  descriptor: ArtifactDescriptor;
}

export interface ReleasePlanGraph {
  nodes: Array<{ id: string; kind: "source" | "build" | "automatic" | "destination" }>;
  edges: Array<{ from: string; to: string }>;
}

export interface ReleasePlan {
  producers: ReleaseProducerConfig[];
  outputs: PlannedReleaseOutput[];
  destinations: ResolvedReleaseDestinationConfig[];
  issues: ValidationIssue[];
  graph: ReleasePlanGraph;
}
