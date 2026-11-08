import type { ArtifactDescriptor, WorkflowStep } from "@pipelab/workflow-runtime";
import type { IconType, RendererProviderMetadata } from "../plugins/definitions";

export type { ArtifactDescriptor, ArtifactKind } from "@pipelab/workflow-runtime";

export const RELEASE_CONFIG_VERSION = "3.1.0" as const;
export const LEGACY_RELEASE_CONFIG_VERSION = "3.0.0" as const;

export const RELEASE_BEFORE_BUILD_TASK_ID = "@pipelab/core/release/before-build" as const;

export type ReleaseConfigVersion =
  | typeof RELEASE_CONFIG_VERSION
  | typeof LEGACY_RELEASE_CONFIG_VERSION;

export interface ReleaseBeforeBuildHook {
  id: string;
  enabled: boolean;
  command: string;
}

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
  /** Single input. Absent for producers that consume several inputs (`inputs` is set instead). */
  input?: ArtifactRef;
  /** Ordered inputs for producers whose definition declares `inputs: "many"`. */
  inputs?: ArtifactRef[];
}

export type ArtifactRef = { source: true } | { producerId: string; outputId: string };

export type ReleaseOutputRef = { source: true } | { buildId: string; targetId: string };

export interface ReleaseBuildProfileConfig {
  id: string;
  type: string;
  engine: string;
  enabled: boolean;
  input?: ReleaseOutputRef;
  /** Explicit ordered inputs; required for engines whose definition declares `inputs: "many"`. */
  inputs?: ReleaseOutputRef[];
  config: Record<string, unknown>;
  targets: ReleaseBuildTargetConfig[];
  beforeBuild?: ReleaseBeforeBuildHook[];
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
  name?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  slots: ReleaseDestinationSlot[];
}

export interface ReleaseConfig {
  version: ReleaseConfigVersion;
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

/** One resolved input handed to a multi-input producer, in the order declared on the build. */
export interface CompiledInput {
  artifact: CompiledArtifact;
  /** The configured reference this input was resolved from. */
  ref: ReleaseOutputRef;
  /** Stable, folder-safe name for this input (for example `win-windows-x64` or `source`). */
  label: string;
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
  /** Query run-environment availability without exposing credential values to compilers. */
  getEnvironmentVariableStatus?: (name: string) => {
    configured: boolean;
    nonEmpty: boolean;
  };
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
  /** Opt in to showing this field in the creation wizard; otherwise it is set in Configuration. */
  showInWizard?: boolean;
  integration?: string;
  required?: boolean;
  /** Hint shown inside an empty text input. */
  placeholder?: string;
  /**
   * For `select` fields these are the choices. For `text` fields they are one-click suggestions
   * that fill the input; any other value can still be typed.
   */
  options?: ReleaseFieldOption[];
  fileExtensions?: string[];
  /**
   * How a `file` field is chosen. `open` picks an existing file (the default); `save` picks a path
   * that may not exist yet, such as an output file.
   */
  pathMode?: "open" | "save";
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
  supportsBeforeBuildHooks?: boolean;
  /**
   * `many` lets a build consume several explicit inputs (`ReleaseBuildProfileConfig.inputs`).
   * `accepts` then applies to each input. Such producers implement `compileMany`; `compile` is not used.
   */
  inputs?: "many";
  targets: ReleaseProducerTargetDefinition[];
  createDefaultConfig(): Record<string, unknown>;
  validate(config: ReleaseProducerConfig, context: ReleaseValidationContext): ValidationIssue[];
  inspect?(
    config: ReleaseProducerConfig,
    context: ReleaseProviderContext,
  ): Promise<ProducerInspection>;
  /** Single-input compilation. Multi-input producers (`inputs: "many"`) never reach it and may throw. */
  compile(
    input: CompiledArtifact,
    config: ReleaseProducerConfig,
    context: ReleaseCompileContext,
  ): CompiledProducer;
  /** Multi-input compilation, called with every resolved input in declared order. */
  compileMany?(
    inputs: CompiledInput[],
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
  /** The destination only takes a build output; a slot may not read the raw source directly. */
  requiresBuild?: boolean;
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

export interface ProviderReleaseDefinition {
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
  availabilityStatus?: "unknown";
}

export interface ReleaseCatalogSource {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  output: ArtifactDescriptor;
  defaultConfig: Record<string, unknown>;
  requiresAgentInspection?: boolean;
}

export interface ReleaseCatalogProducer {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  planning: ReleaseProducerPlanning;
  supportsBeforeBuildHooks?: boolean;
  inputs?: "many";
  defaultConfig: Record<string, unknown>;
  targets: ReleaseCatalogTarget[];
  requiresAgentInspection?: boolean;
}

export interface ReleaseCatalogDestination {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
  fields?: ReleaseFieldDefinition[];
  slotFields?: ReleaseFieldDefinition[];
  accepts: ArtifactConstraint;
  /** The destination only takes a build output; a slot may not read the raw source directly. */
  requiresBuild?: boolean;
  defaultConfig: Record<string, unknown>;
}

export interface ReleaseCatalog {
  buildTypes: ReleaseBuildTypeDefinition[];
  sources: ReleaseCatalogSource[];
  producers: ReleaseCatalogProducer[];
  destinations: ReleaseCatalogDestination[];
}

export const BROWSER_PROVIDER_SPECS_SCHEMA_VERSION = 1 as const;

export interface BrowserProviderSpecs {
  schemaVersion: typeof BROWSER_PROVIDER_SPECS_SCHEMA_VERSION;
  releaseConfigVersion: typeof RELEASE_CONFIG_VERSION;
  catalog: ReleaseCatalog;
  providers: Array<Omit<RendererProviderMetadata, "release">>;
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

/** @deprecated Use ProviderReleaseDefinition. */
export type PluginReleaseDefinition = ProviderReleaseDefinition;
