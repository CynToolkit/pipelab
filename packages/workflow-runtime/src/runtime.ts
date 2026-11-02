import {
  WORKFLOW_VERSION,
  type Workflow,
  type WorkflowArtifact,
  type WorkflowArtifactInstance,
  type WorkflowError,
  type WorkflowEventInput,
  type WorkflowResult,
  type WorkflowRunContext,
  type WorkflowConnectionOverride,
  type WorkflowConnectionRequirement,
  type WorkflowConnectionValues,
  type WorkflowStep,
  type WorkflowStepResult,
  type WorkflowEnvironment,
  type WorkflowTaskRegistry,
  type WorkflowPhaseDefinition,
  type WorkflowPhaseOutcome,
  type WorkflowPhaseResult,
  type WorkflowPhaseRunner,
  type WorkflowPhaseTools,
} from "./types";
import { RUN_COMMAND_TASK_ID, runCommandTask } from "./tasks/run-command";
import type { WorkflowArtifactReference } from "./types";

const builtInTasks: WorkflowTaskRegistry = {
  [RUN_COMMAND_TASK_ID]: runCommandTask,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(typeof value === "string" ? value : String(value));

const serializeError = (value: unknown, redact: (value: string) => string): WorkflowError => {
  const error = toError(value);
  return { name: redact(error.name || "Error"), message: redact(error.message) };
};

const abortError = (reason: unknown): Error => {
  const error = new Error(
    reason instanceof Error ? reason.message : String(reason || "Workflow cancelled"),
  );
  error.name = "AbortError";
  return error;
};

const ensureNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw abortError(signal.reason);
};

const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const formatLog = (args: unknown[]): string => args.map(formatLogValue).join(" ");

const getPath = (value: Record<string, unknown>, path: string): unknown => {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`Workflow reference not found: ${path}`);
    }
    current = current[segment];
  }
  return current;
};

const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const forEachReference = (value: string, visit: (reference: string) => void): void => {
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("${{", cursor);
    if (start < 0) return;
    const end = value.indexOf("}}", start + 3);
    if (end < 0) return;
    visit(value.slice(start + 3, end));
    cursor = end + 2;
  }
};

const replaceReferences = (value: string, resolve: (reference: string) => string): string => {
  let cursor = 0;
  let result = "";
  while (cursor < value.length) {
    const start = value.indexOf("${{", cursor);
    if (start < 0) break;
    const end = value.indexOf("}}", start + 3);
    if (end < 0) break;
    result += value.slice(cursor, start);
    result += resolve(value.slice(start + 3, end));
    cursor = end + 2;
  }
  return cursor === 0 ? value : result + value.slice(cursor);
};

const isWorkflowArtifactWithPath = (value: Record<string, unknown>): boolean =>
  typeof value.path === "string" &&
  (typeof value.name === "string" ||
    (typeof value.id === "string" &&
      typeof value.stepId === "string" &&
      typeof value.artifact === "string"));

const isWorkflowArtifactListOwner = (value: Record<string, unknown>): boolean =>
  (typeof value.status === "string" && Array.isArray(value.artifacts) && isRecord(value.steps)) ||
  (typeof value.id === "string" &&
    typeof value.uses === "string" &&
    Array.isArray(value.artifacts));

const collectEnvironmentReferences = (workflow: Workflow): string[] => {
  const references = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (isRecord(value)) {
      Object.values(value).forEach(collect);
      return;
    }
    if (typeof value !== "string") return;
    forEachReference(value, (rawReference) => {
      const reference = rawReference.trim();
      if (!reference.startsWith("env.")) return;
      references.add(reference.slice("env.".length));
    });
  };
  workflow.steps.forEach((step) => collect(step.with));
  return [...references];
};

const resolveConnectionValues = (
  initial: WorkflowConnectionValues = {},
  overrides: readonly WorkflowConnectionOverride[] = [],
  env: WorkflowEnvironment = {},
): WorkflowConnectionValues => {
  const fieldsByAlias = new Map<string, Map<string, string>>();
  const overrideTargets = new Set<string>();
  const set = (alias: string, field: string, value: string) => {
    let fields = fieldsByAlias.get(alias);
    if (!fields) {
      fields = new Map();
      fieldsByAlias.set(alias, fields);
    }
    fields.set(field, value);
  };

  for (const [alias, fields] of Object.entries(initial)) {
    if (!alias.trim() || !isRecord(fields))
      throw new Error("Invalid run-scoped connection values.");
    const resolvedFields = new Map<string, string>();
    fieldsByAlias.set(alias, resolvedFields);
    for (const [field, value] of Object.entries(fields)) {
      if (!field.trim() || typeof value !== "string")
        throw new Error("Invalid run-scoped connection values.");
      resolvedFields.set(field, value);
    }
  }

  for (const override of overrides) {
    if (!override || !override.alias.trim() || !override.field.trim())
      throw new Error("Invalid workflow connection override target.");
    const target = `${override.alias}.${override.field}`;
    if (fieldsByAlias.get(override.alias)?.has(override.field) || overrideTargets.has(target)) {
      throw new Error(`Workflow Connection field '${target}' is mapped more than once.`);
    }
    overrideTargets.add(target);
    let value: string;
    if (override.value.kind === "literal") {
      if (typeof override.value.value !== "string")
        throw new Error("Invalid workflow connection override value.");
      value = override.value.value;
    } else if (override.value.kind === "environment") {
      if (!environmentVariableNamePattern.test(override.value.name))
        throw new Error(`Invalid environment variable reference: env.${override.value.name}`);
      if (!Object.hasOwn(env, override.value.name) || env[override.value.name] === undefined)
        throw new Error(`Workflow environment variable is not set: ${override.value.name}`);
      value = env[override.value.name]!;
    } else {
      throw new Error("Invalid workflow connection override value.");
    }
    set(override.alias, override.field, value);
  }

  return Object.freeze(
    Object.fromEntries(
      [...fieldsByAlias].map(([alias, fields]) => [
        alias,
        Object.freeze(Object.fromEntries(fields)),
      ]),
    ),
  );
};

export interface RunScopedWorkflowValueResolverOptions {
  connectionValues?: WorkflowConnectionValues;
  connectionOverrides?: readonly WorkflowConnectionOverride[];
  connectionRequirements?: readonly WorkflowConnectionRequirement[];
  requiredEnvironmentVariables?: readonly string[];
}

const validateConnectionRequirements = (
  values: WorkflowConnectionValues,
  requirements: readonly WorkflowConnectionRequirement[] | undefined,
): void => {
  if (requirements === undefined) return;

  const fieldsByAlias = new Map<string, { required: boolean; fields: Map<string, boolean> }>();
  for (const requirement of requirements) {
    if (
      !requirement.alias.trim() ||
      typeof requirement.required !== "boolean" ||
      !Array.isArray(requirement.fields)
    ) {
      throw new Error("Invalid workflow Connection requirements.");
    }
    let aliasRequirement = fieldsByAlias.get(requirement.alias);
    if (!aliasRequirement) {
      aliasRequirement = { required: false, fields: new Map() };
      fieldsByAlias.set(requirement.alias, aliasRequirement);
    }
    aliasRequirement.required ||= requirement.required;
    for (const field of requirement.fields) {
      if (!field.key.trim() || typeof field.required !== "boolean") {
        throw new Error("Invalid workflow Connection requirements.");
      }
      aliasRequirement.fields.set(
        field.key,
        field.required || aliasRequirement.fields.get(field.key) === true,
      );
    }
  }

  for (const [alias, fields] of Object.entries(values)) {
    const declaredFields = fieldsByAlias.get(alias)?.fields;
    if (!declaredFields) {
      throw new Error(`Workflow Connection alias '${alias}' is not declared.`);
    }
    for (const field of Object.keys(fields)) {
      if (!declaredFields.has(field)) {
        throw new Error(`Workflow Connection alias '${alias}' does not define field '${field}'.`);
      }
    }
  }

  for (const [alias, requirement] of fieldsByAlias) {
    if (!Object.hasOwn(values, alias)) {
      if (requirement.required) {
        throw new Error(`Required workflow Connection alias is missing: ${alias}`);
      }
      continue;
    }
    for (const [field, required] of requirement.fields) {
      if (!required) continue;
      const value = values[alias]?.[field];
      if (value === undefined) {
        throw new Error(`Required workflow Connection field is missing: ${alias}.${field}`);
      }
      if (value.length === 0) {
        throw new Error(`Required workflow Connection field is empty: ${alias}.${field}`);
      }
    }
  }
};

export const preflightWorkflow = (
  workflow: Workflow,
  env: WorkflowEnvironment = {},
  options: RunScopedWorkflowValueResolverOptions = {},
): void => {
  for (const name of collectEnvironmentReferences(workflow)) {
    if (!environmentVariableNamePattern.test(name)) {
      throw new Error(`Invalid environment variable reference: env.${name}`);
    }
    if (!Object.hasOwn(env, name) || env[name] === undefined) {
      throw new Error(`Workflow environment variable is not set: ${name}`);
    }
  }
  for (const name of options.requiredEnvironmentVariables ?? []) {
    if (!environmentVariableNamePattern.test(name)) {
      throw new Error(`Invalid environment variable reference: env.${name}`);
    }
    if (!Object.hasOwn(env, name) || env[name] === undefined) {
      throw new Error(`Workflow environment variable is not set: ${name}`);
    }
    if (env[name] === "") {
      throw new Error(`Workflow environment variable is empty: ${name}`);
    }
  }
  const connectionValues = resolveConnectionValues(
    options.connectionValues,
    options.connectionOverrides,
    env,
  );
  validateConnectionRequirements(connectionValues, options.connectionRequirements);
};

const collectEnvironmentValues = (workflow: Workflow, env: WorkflowEnvironment): string[] => {
  const values = new Set<string>();
  for (const name of collectEnvironmentReferences(workflow)) {
    const value = env[name];
    if (value) values.add(value);
  }
  return [...values].sort((left, right) => right.length - left.length);
};

export interface WorkflowValueResolver {
  connectionValues: WorkflowConnectionValues;
  resolveInputs(
    step: WorkflowStep,
    outputs: Record<string, Record<string, unknown>>,
  ): Record<string, unknown>;
  redactString(value: string): string;
  redactObject<T>(value: T): T;
}

interface InternalRunScopedWorkflowValueResolver extends WorkflowValueResolver {
  redactResultPreservingArtifactPaths<T>(value: T): T;
}

const createInternalRunScopedWorkflowValueResolver = (
  workflow: Workflow,
  variables: Record<string, unknown>,
  env: WorkflowEnvironment,
  options: RunScopedWorkflowValueResolverOptions = {},
): InternalRunScopedWorkflowValueResolver => {
  const runEnvironment = Object.freeze({ ...env });
  const runConnectionValues = resolveConnectionValues(
    options.connectionValues,
    options.connectionOverrides,
    runEnvironment,
  );
  preflightWorkflow(workflow, runEnvironment, options);
  const secrets = [
    ...new Set(
      [
        ...collectEnvironmentValues(workflow, runEnvironment),
        ...Object.values(runConnectionValues).flatMap((fields) => Object.values(fields)),
      ].filter((value) => value.length > 0),
    ),
  ].sort((left, right) => right.length - left.length);
  const redactString = (value: string) =>
    secrets.reduce((result, secret) => result.split(secret).join("[REDACTED]"), value);

  return {
    connectionValues: runConnectionValues,
    resolveInputs: (step, outputs) => resolveInputs(step, variables, outputs, runEnvironment),
    redactString,
    redactObject: <T>(value: T) => redactValue(value, secrets),
    redactResultPreservingArtifactPaths: <T>(value: T) => redactValue(value, secrets, true),
  };
};

export const createRunScopedWorkflowValueResolver = (
  workflow: Workflow,
  variables: Record<string, unknown>,
  env: WorkflowEnvironment,
  options: RunScopedWorkflowValueResolverOptions = {},
): WorkflowValueResolver =>
  createInternalRunScopedWorkflowValueResolver(workflow, variables, env, options);

const redactValue = <T>(value: T, secrets: readonly string[], preserveArtifactPaths = false): T => {
  const redactString = (text: string) =>
    secrets.reduce((result, secret) => result.split(secret).join("[REDACTED]"), text);
  const seen = new WeakMap<object, unknown>();
  const visit = (current: unknown, artifactListItem = false): unknown => {
    if (typeof current === "string") return redactString(current);
    if (typeof current !== "object" || current === null) return current;
    const previous = seen.get(current);
    if (previous !== undefined) return previous;
    if (Array.isArray(current)) {
      const result: unknown[] = [];
      seen.set(current, result);
      current.forEach((item) => result.push(visit(item, artifactListItem)));
      return result;
    }
    if (!isRecord(current)) return current;
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) return current;
    const preservePath =
      preserveArtifactPaths && artifactListItem && isWorkflowArtifactWithPath(current);
    const result: Record<string, unknown> = Object.create(prototype);
    seen.set(current, result);
    for (const [key, item] of Object.entries(current)) {
      result[key] =
        preservePath && key === "path"
          ? item
          : key === "artifacts" && Array.isArray(item) && isWorkflowArtifactListOwner(current)
            ? visit(item, true)
            : visit(item);
    }
    return result;
  };
  return visit(value) as T;
};

const resolveReference = (
  reference: string,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
  env: Record<string, string | undefined>,
): unknown => {
  if (reference.startsWith("env.")) {
    const name = reference.slice("env.".length);
    if (!environmentVariableNamePattern.test(name)) {
      throw new Error(`Invalid environment variable reference: ${reference}`);
    }
    if (!Object.hasOwn(env, name) || env[name] === undefined) {
      throw new Error(`Workflow environment variable is not set: ${name}`);
    }
    return env[name];
  }
  if (reference.startsWith("variables.")) {
    return getPath(variables, reference.slice("variables.".length));
  }
  if (reference.startsWith("steps.")) {
    const match = /^steps\.([^.]+)\.outputs\.(.+)$/.exec(reference);
    if (!match) throw new Error(`Invalid workflow reference: ${reference}`);
    const stepOutputs = outputs[match[1]];
    if (!stepOutputs) throw new Error(`Workflow step output not found: ${match[1]}`);
    return getPath(stepOutputs, match[2]);
  }
  throw new Error(`Invalid workflow reference: ${reference}`);
};

const resolveValue = (
  value: unknown,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
  env: Record<string, string | undefined>,
): unknown => {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, variables, outputs, env));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveValue(item, variables, outputs, env),
      ]),
    );
  }
  if (typeof value !== "string") return value;

  const exact = /^\$\{\{([^{}]+)\}\}$/.exec(value);
  if (exact) return resolveReference(exact[1].trim(), variables, outputs, env);

  return replaceReferences(value, (reference) =>
    formatLogValue(resolveReference(reference.trim(), variables, outputs, env)),
  );
};

const resolveInputs = (
  step: WorkflowStep,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
  env: Record<string, string | undefined>,
): Record<string, unknown> => {
  if (!step.with) return {};
  return resolveValue(step.with, variables, outputs, env) as Record<string, unknown>;
};

const resolveArtifactInputs = (
  step: WorkflowStep,
  artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>,
): Record<string, string> => {
  const resolved: Record<string, string> = {};
  for (const [inputName, reference] of Object.entries(step.artifactInputs ?? {})) {
    const artifact = artifactForDelivery(reference, artifacts);
    if (!artifact) {
      throw new Error(
        `Workflow step ${step.id} requires artifact "${reference.artifact}" from step "${reference.stepId}", but that artifact was not produced.`,
      );
    }
    resolved[inputName] = artifact.path;
  }
  return resolved;
};

const validatePhaseDefinitions = (stepId: string, phases: unknown): void => {
  if (!Array.isArray(phases)) {
    throw new Error(`Workflow step ${stepId} phases must be an array`);
  }
  const ids = new Set<string>();
  for (const [index, phase] of phases.entries()) {
    if (
      !isRecord(phase) ||
      typeof phase.id !== "string" ||
      !phase.id.trim() ||
      typeof phase.title !== "string" ||
      !phase.title.trim()
    ) {
      throw new Error(
        `Workflow step ${stepId} phase ${index + 1} must have a non-empty id and title`,
      );
    }
    if (ids.has(phase.id)) {
      throw new Error(`Workflow step ${stepId} has duplicate phase id: ${phase.id}`);
    }
    ids.add(phase.id);
  }
};

const normalizePhaseOutcome = (value: unknown): WorkflowPhaseOutcome | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Workflow phase callback returned an invalid outcome");
  if (value.status === "completed") {
    if (value.message !== undefined && typeof value.message !== "string") {
      throw new Error("Workflow phase callback returned an invalid outcome");
    }
    return typeof value.message === "string"
      ? { status: "completed", message: value.message }
      : { status: "completed" };
  }
  if (value.status === "skipped" && typeof value.reason === "string" && value.reason.trim()) {
    return { status: "skipped", reason: value.reason };
  }
  throw new Error("Workflow phase callback returned an invalid outcome");
};

const samePhaseCatalog = (
  left: readonly WorkflowPhaseDefinition[] | undefined,
  right: readonly WorkflowPhaseDefinition[],
): boolean =>
  Boolean(
    left &&
    left.length === right.length &&
    left.every(
      (phase, index) => phase.id === right[index]?.id && phase.title === right[index]?.title,
    ),
  );

const validateWorkflow = (workflow: Workflow): void => {
  if (!isRecord(workflow) || workflow.version !== WORKFLOW_VERSION) {
    throw new Error(`Unsupported workflow version: ${String(workflow?.version)}`);
  }
  if (!Array.isArray(workflow.steps)) throw new Error("Workflow steps must be an array");

  const ids = new Set<string>();
  for (const step of workflow.steps) {
    if (!isRecord(step) || typeof step.id !== "string" || step.id.length === 0) {
      throw new Error("Every workflow step must have a non-empty id");
    }
    if (ids.has(step.id)) throw new Error(`Duplicate workflow step id: ${step.id}`);
    ids.add(step.id);
    if (typeof step.uses !== "string" || step.uses.length === 0) {
      throw new Error(`Workflow step ${step.id} must have a non-empty uses value`);
    }
    if (
      step.needs !== undefined &&
      (!Array.isArray(step.needs) ||
        step.needs.some((dependency) => typeof dependency !== "string"))
    ) {
      throw new Error(`Workflow step ${step.id} dependencies must be an array of step ids`);
    }
    if (Array.isArray(step.needs) && step.needs.includes(step.id)) {
      throw new Error(`Workflow step ${step.id} cannot depend on itself`);
    }
    if (step.with !== undefined && !isRecord(step.with)) {
      throw new Error(`Workflow step ${step.id} inputs must be an object`);
    }
    if (step.phases !== undefined) validatePhaseDefinitions(step.id, step.phases);
    if (step.artifactInputs !== undefined && !isRecord(step.artifactInputs)) {
      throw new Error(`Workflow step ${step.id} artifact inputs must be an object`);
    }
    for (const [inputName, reference] of Object.entries(step.artifactInputs ?? {})) {
      if (
        !isRecord(reference) ||
        typeof reference.stepId !== "string" ||
        !reference.stepId ||
        typeof reference.artifact !== "string" ||
        !reference.artifact
      ) {
        throw new Error(
          `Workflow step ${step.id} artifact input ${inputName} must reference a step artifact`,
        );
      }
    }
    if (step.delivery !== undefined) {
      if (
        !isRecord(step.delivery) ||
        typeof step.delivery.destinationId !== "string" ||
        !step.delivery.destinationId ||
        typeof step.delivery.slotId !== "string" ||
        !step.delivery.slotId ||
        !isRecord(step.delivery.artifact) ||
        typeof step.delivery.artifact.stepId !== "string" ||
        !step.delivery.artifact.stepId ||
        typeof step.delivery.artifact.artifact !== "string" ||
        !step.delivery.artifact.artifact
      ) {
        throw new Error(
          `Workflow delivery step ${step.id} must declare a destination, slot, and artifact output`,
        );
      }
    }
  }

  for (const [index, step] of workflow.steps.entries()) {
    const dependencies = step.needs ?? (index > 0 ? [workflow.steps[index - 1].id] : []);
    for (const dependency of dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`Workflow step ${step.id} depends on unknown step: ${dependency}`);
      }
    }
    for (const reference of Object.values(step.artifactInputs ?? {})) {
      if (
        isRecord(reference) &&
        typeof reference.stepId === "string" &&
        !ids.has(reference.stepId)
      ) {
        throw new Error(
          `Workflow step ${step.id} references an unknown artifact step: ${reference.stepId}`,
        );
      }
      if (
        isRecord(reference) &&
        typeof reference.stepId === "string" &&
        typeof reference.artifact === "string" &&
        ids.has(reference.stepId)
      ) {
        const referencedStep = workflow.steps.find(
          (candidate) => candidate.id === reference.stepId,
        );
        if (
          !referencedStep?.artifacts ||
          !Object.prototype.hasOwnProperty.call(referencedStep.artifacts, reference.artifact)
        ) {
          throw new Error(
            `Workflow step ${step.id} references undeclared artifact "${reference.artifact}" on workflow step "${reference.stepId}"`,
          );
        }
      }
    }
    if (step.delivery?.artifact && ids.has(step.delivery.artifact.stepId)) {
      const referencedStep = workflow.steps.find(
        (candidate) => candidate.id === step.delivery!.artifact.stepId,
      );
      if (
        !referencedStep?.artifacts ||
        !Object.prototype.hasOwnProperty.call(
          referencedStep.artifacts,
          step.delivery.artifact.artifact,
        )
      ) {
        throw new Error(
          `Workflow step ${step.id} references undeclared artifact "${step.delivery.artifact.artifact}" on workflow step "${step.delivery.artifact.stepId}"`,
        );
      }
    }
    if (step.delivery?.artifact && !ids.has(step.delivery.artifact.stepId)) {
      throw new Error(
        `Workflow step ${step.id} references an unknown artifact step: ${step.delivery.artifact.stepId}`,
      );
    }
  }
};

const dependenciesFor = (workflow: Workflow, step: WorkflowStep): readonly string[] => {
  const index = workflow.steps.findIndex((candidate) => candidate.id === step.id);
  return [
    ...new Set([
      ...(step.needs ?? (index > 0 ? [workflow.steps[index - 1].id] : [])),
      ...Object.values(step.artifactInputs ?? {}).map((reference) => reference.stepId),
    ]),
  ];
};

const artifactForDelivery = (
  reference: WorkflowArtifactReference,
  artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>,
): WorkflowArtifactInstance | undefined => {
  return artifacts.find(
    (artifact): artifact is WorkflowArtifactInstance =>
      "descriptor" in artifact &&
      artifact.stepId === reference.stepId &&
      artifact.artifact === reference.artifact,
  );
};

export const runWorkflow = async <TServices = unknown>(
  workflow: Workflow,
  context: WorkflowRunContext<TServices>,
): Promise<WorkflowResult> => {
  validateWorkflow(workflow);
  const signal = context.signal ?? new AbortController().signal;
  const tasks = { ...builtInTasks, ...context.tasks };
  const variables = context.variables ?? {};
  const env = context.env ?? {};
  const valueResolver = createInternalRunScopedWorkflowValueResolver(workflow, variables, env, {
    connectionValues: context.connectionValues,
    connectionOverrides: context.connectionOverrides,
    connectionRequirements: context.connectionRequirements,
    requiredEnvironmentVariables: context.requiredEnvironmentVariables,
  });
  const redact = valueResolver.redactString;
  const redactObject = <T>(value: T) => valueResolver.redactObject(value);
  const services = context.services ?? ({} as TServices);
  const outputs: Record<string, Record<string, unknown>> = {};
  const steps: Record<string, WorkflowStepResult> = {};
  const artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance> = [];
  let artifactSequence = 0;
  const startedAt = Date.now();
  const emit = (event: WorkflowEventInput): void => {
    context.onEvent?.(redactObject({ ...event, timestamp: Date.now() }));
  };

  emit({ type: "workflow.started", workflow });

  try {
    const pending = new Set(workflow.steps.map((step) => step.id));
    const continueOnError = workflow.continueOnError ?? false;
    const failFast = !continueOnError;

    const runStep = async (step: WorkflowStep): Promise<void> => {
      const stepStartedAt = Date.now();
      const stepArtifacts: Array<WorkflowArtifact | WorkflowArtifactInstance> = [];
      const phaseResults = new Map<string, WorkflowPhaseResult>(
        (step.phases ?? []).map((phase) => [
          phase.id,
          { ...phase, status: "pending", warnings: [] as string[] },
        ]),
      );
      const phaseDiagnostics: string[] = [];
      let deliveryArtifact: WorkflowArtifactInstance | undefined;
      const phaseSnapshot = (): WorkflowPhaseResult[] =>
        [...phaseResults.values()].map((phase) => ({ ...phase, warnings: [...phase.warnings] }));
      const phaseCalls = new Set<Promise<void>>();
      const phaseCallErrors: unknown[] = [];
      const reportPhaseWarning = (phaseId: string, message: string, diagnostic = false): void => {
        const phase = phaseResults.get(phaseId);
        if (phase) phase.warnings.push(redact(message));
        if (diagnostic) phaseDiagnostics.push(redact(message));
        emit({
          type: "phase.warning",
          stepId: step.id,
          phaseId,
          message,
          ...(diagnostic ? { diagnostic: true } : {}),
        });
      };
      const finishPhases = (successful: boolean, parentError?: WorkflowError): void => {
        for (const phase of phaseResults.values()) {
          if (phase.status === "running" && !successful) {
            const completedAt = Date.now();
            phase.status = "failed";
            phase.completedAt = completedAt;
            phase.duration = completedAt - (phase.startedAt ?? completedAt);
            phase.error = parentError ?? { name: "Error", message: "Workflow step failed" };
            emit({
              type: "phase.failed",
              stepId: step.id,
              phaseId: phase.id,
              error: phase.error,
              duration: phase.duration,
            });
            continue;
          }
          if (phase.status !== "pending") continue;
          phase.status = successful ? "not-reported" : "not-reached";
          if (successful) {
            const message = "Declared phase was not reported by the provider.";
            phase.warnings.push(message);
            phaseDiagnostics.push(message);
            emit({
              type: "phase.warning",
              stepId: step.id,
              phaseId: phase.id,
              message,
              diagnostic: true,
            });
          }
          emit({
            type: successful ? "phase.not-reported" : "phase.not-reached",
            stepId: step.id,
            phaseId: phase.id,
            title: phase.title,
          });
        }
      };
      emit({ type: "step.started", stepId: step.id, uses: step.uses });

      try {
        ensureNotAborted(signal);
        const resolvedDeliveryArtifact = step.delivery
          ? artifactForDelivery(step.delivery.artifact, artifacts)
          : undefined;
        deliveryArtifact = resolvedDeliveryArtifact;
        if (step.delivery && !resolvedDeliveryArtifact) {
          throw new Error(
            `Workflow delivery step ${step.id} requires artifact "${step.delivery.artifact.artifact}" from step "${step.delivery.artifact.stepId}", but that artifact was not produced.`,
          );
        }
        const task = tasks[step.uses];
        if (!task) throw new Error(`Workflow task not found: ${step.uses}`);
        const inputs = {
          ...valueResolver.resolveInputs(step, outputs),
          ...resolveArtifactInputs(step, artifacts),
        };
        const safeLogger = {
          info: (...args: unknown[]) => context.host.logger.info(redact(formatLog(args))),
          warn: (...args: unknown[]) => context.host.logger.warn(redact(formatLog(args))),
          error: (...args: unknown[]) => context.host.logger.error(redact(formatLog(args))),
        };
        const withPhases = <const T extends readonly WorkflowPhaseDefinition[]>(
          catalog: T,
        ): WorkflowPhaseRunner<T[number]["id"]> => {
          const matches = samePhaseCatalog(step.phases, catalog);
          if (!matches) {
            const declaredIds = new Set(step.phases?.map((phase) => phase.id) ?? []);
            const boundIds = new Set(catalog.map((phase) => phase.id));
            for (const phase of step.phases ?? []) {
              const bound = catalog.find((candidate) => candidate.id === phase.id);
              if (!bound || bound.title !== phase.title) {
                reportPhaseWarning(
                  phase.id,
                  `Bound phase catalog does not match the compiled definition for '${phase.id}'.`,
                  true,
                );
              }
            }
            for (const phase of catalog) {
              if (!declaredIds.has(phase.id)) {
                reportPhaseWarning(
                  phase.id,
                  `Phase '${phase.id}' is not declared on compiled workflow step ${step.id}.`,
                  true,
                );
              }
            }
            const orderDiffers =
              step.phases?.length === catalog.length &&
              step.phases.some((phase, index) => phase.id !== catalog[index]?.id);
            if (
              step.phases &&
              (catalog.length !== step.phases.length || orderDiffers) &&
              boundIds.size === declaredIds.size
            ) {
              reportPhaseWarning(
                "catalog",
                "Bound phase catalog has a different order or duplicate entries than the compiled definition.",
                true,
              );
            }
          }

          const phase = <Id extends T[number]["id"]>(
            phaseId: Id,
            callback: (
              tools: WorkflowPhaseTools,
            ) => WorkflowPhaseOutcome | void | Promise<WorkflowPhaseOutcome | void>,
          ): Promise<void> => {
            const id = String(phaseId);
            const phaseResult = phaseResults.get(id);
            const tracked = Boolean(phaseResult && phaseResult.status === "pending");
            if (!phaseResult) {
              reportPhaseWarning(
                id,
                `Phase '${id}' is not declared on compiled workflow step ${step.id}.`,
                true,
              );
            } else if (!tracked) {
              reportPhaseWarning(id, `Phase '${id}' was invoked more than once.`, true);
            }

            const startedAt = Date.now();
            if (tracked && phaseResult) {
              phaseResult.status = "running";
              phaseResult.startedAt = startedAt;
              emit({
                type: "phase.started",
                stepId: step.id,
                phaseId: id,
                title: phaseResult.title,
              });
            }

            const tools: WorkflowPhaseTools = {
              skip: (reason) => {
                if (typeof reason !== "string" || !reason.trim()) {
                  throw new Error(`Workflow phase ${id} requires a skip reason`);
                }
                return { status: "skipped", reason };
              },
              success: (message) => ({ status: "completed", message }),
              fail: (errorOrMessage): never => {
                throw toError(errorOrMessage);
              },
              warn: (message) => {
                if (typeof message !== "string" || !message.trim()) {
                  throw new Error(`Workflow phase ${id} requires a warning message`);
                }
                reportPhaseWarning(id, message);
              },
            };

            const execution = (async () => {
              try {
                const outcome = normalizePhaseOutcome(await callback(tools));
                if (!tracked || !phaseResult) return;
                const completedAt = Date.now();
                const wasSkipped = outcome?.status === "skipped";
                phaseResult.status = wasSkipped ? "skipped" : "completed";
                phaseResult.completedAt = completedAt;
                phaseResult.duration = completedAt - startedAt;
                if (outcome?.status === "skipped") {
                  phaseResult.message = redact(outcome.reason);
                  emit({
                    type: "phase.skipped",
                    stepId: step.id,
                    phaseId: id,
                    reason: outcome.reason,
                    duration: phaseResult.duration,
                  });
                } else {
                  const message = outcome?.status === "completed" ? outcome.message : undefined;
                  if (message !== undefined) phaseResult.message = redact(message);
                  emit({
                    type: "phase.completed",
                    stepId: step.id,
                    phaseId: id,
                    ...(message !== undefined ? { message } : {}),
                    duration: phaseResult.duration,
                  });
                }
              } catch (error) {
                if (tracked && phaseResult) {
                  const completedAt = Date.now();
                  const serialized = serializeError(error, redact);
                  phaseResult.status = "failed";
                  phaseResult.completedAt = completedAt;
                  phaseResult.duration = completedAt - startedAt;
                  phaseResult.error = serialized;
                  emit({
                    type: "phase.failed",
                    stepId: step.id,
                    phaseId: id,
                    error: serialized,
                    duration: phaseResult.duration,
                  });
                }
                throw error;
              }
            })();
            phaseCalls.add(execution);
            void execution.catch((error: unknown) => {
              phaseCallErrors.push(error);
            });
            void execution
              .finally((): void => {
                phaseCalls.delete(execution);
              })
              .catch((): undefined => undefined);
            return execution;
          };

          return { phase };
        };

        let taskResult: Record<string, unknown> | void;
        try {
          taskResult = await task({
            step,
            inputs,
            connectionValues: valueResolver.connectionValues,
            outputs: Object.freeze({ ...outputs }),
            artifacts: [...artifacts],
            services,
            ...(step.delivery && resolvedDeliveryArtifact
              ? {
                  delivery: {
                    destinationId: step.delivery.destinationId,
                    slotId: step.delivery.slotId,
                    artifact: resolvedDeliveryArtifact,
                  },
                }
              : {}),
            workspace: context.host.workspace,
            filesystem: context.host.filesystem,
            processes: context.host.processes,
            logger: safeLogger,
            signal,
            log: (...args) => {
              const message = redact(formatLog(args));
              context.host.logger.info(message);
              emit({
                type: "step.log",
                stepId: step.id,
                stream: "stdout",
                message,
              });
            },
            logStream: (stream, ...args) => {
              const message = redact(formatLog(args));
              context.host.logger.info(message);
              emit({ type: "step.log", stepId: step.id, stream, message, chunk: true });
            },
            setArtifact: (outputId, path, metadata) => {
              const definition = step.artifacts?.[outputId];
              if (!definition)
                throw new Error(
                  `Workflow step ${step.id} declared no artifact named "${outputId}"`,
                );
              if (
                stepArtifacts.some(
                  (artifact) =>
                    "descriptor" in artifact &&
                    artifact.artifact === outputId &&
                    artifact.path === path,
                )
              )
                return;
              stepArtifacts.push(
                Object.freeze({
                  id: `artifact-${context.buildId ?? startedAt}-${artifactSequence++}`,
                  descriptor: definition.descriptor,
                  version: context.version,
                  path,
                  stepId: step.id,
                  artifact: outputId,
                  checksum: metadata?.checksum,
                  size: metadata?.size,
                }) as WorkflowArtifactInstance,
              );
            },
            withPhases,
          });
        } finally {
          await Promise.allSettled(phaseCalls);
        }
        if (phaseCallErrors.length) throw phaseCallErrors[0];
        const result = taskResult ?? {};
        ensureNotAborted(signal);
        if (!isRecord(result))
          throw new Error(`Workflow task ${step.uses} returned invalid outputs`);

        const cloud = result.cloud as WorkflowArtifactInstance["cloud"] | undefined;
        if (resolvedDeliveryArtifact && cloud && typeof cloud.hostedArtifactId === "string") {
          const updatedArtifact = Object.freeze({ ...resolvedDeliveryArtifact, cloud });
          const artifactIndex = artifacts.findIndex(
            (artifact) => "descriptor" in artifact && artifact.id === resolvedDeliveryArtifact.id,
          );
          if (artifactIndex >= 0) artifacts[artifactIndex] = updatedArtifact;
          stepArtifacts.push(updatedArtifact);
        }

        const completedAt = Date.now();
        finishPhases(true);
        const stepResult: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "completed",
          outputs: result,
          artifacts: [...stepArtifacts],
          startedAt: stepStartedAt,
          completedAt,
          duration: completedAt - stepStartedAt,
          ...(phaseResults.size > 0 ? { phases: phaseSnapshot() } : {}),
          ...(phaseDiagnostics.length > 0 ? { diagnostics: [...phaseDiagnostics] } : {}),
        };
        if (step.delivery && resolvedDeliveryArtifact) {
          stepResult.delivery = {
            id: step.id,
            destinationId: step.delivery.destinationId,
            slotId: step.delivery.slotId,
            artifactId: resolvedDeliveryArtifact.id,
            status: "completed",
            startedAt: stepStartedAt,
            completedAt,
            duration: completedAt - stepStartedAt,
          };
        }
        outputs[step.id] = result;
        steps[step.id] = stepResult;
        for (const artifact of stepArtifacts) {
          const existingIndex =
            "descriptor" in artifact
              ? artifacts.findIndex(
                  (existing) => "descriptor" in existing && existing.id === artifact.id,
                )
              : -1;
          if (existingIndex >= 0) artifacts[existingIndex] = artifact;
          else artifacts.push(artifact);
        }
        emit({
          type: "step.completed",
          stepId: step.id,
          uses: step.uses,
          outputs: result,
          artifacts: [...stepArtifacts],
          duration: stepResult.duration,
        });
      } catch (error) {
        const normalized = signal.aborted ? abortError(signal.reason) : toError(error);
        const completedAt = Date.now();
        const serialized = serializeError(normalized, redact);
        finishPhases(false, serialized);
        const failedStep: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "failed",
          outputs: {},
          artifacts: [...stepArtifacts],
          startedAt: stepStartedAt,
          completedAt,
          duration: completedAt - stepStartedAt,
          error: serialized,
          ...(phaseResults.size > 0 ? { phases: phaseSnapshot() } : {}),
          ...(phaseDiagnostics.length > 0 ? { diagnostics: [...phaseDiagnostics] } : {}),
        };
        if (step.delivery && deliveryArtifact) {
          failedStep.delivery = {
            id: step.id,
            destinationId: step.delivery.destinationId,
            slotId: step.delivery.slotId,
            artifactId: deliveryArtifact.id,
            status: "failed",
            startedAt: stepStartedAt,
            completedAt,
            duration: completedAt - stepStartedAt,
            error: serialized.message,
          };
        }
        steps[step.id] = failedStep;
        emit({
          type: "step.failed",
          stepId: step.id,
          uses: step.uses,
          error: serialized,
          duration: completedAt - stepStartedAt,
        });
        throw normalized;
      }
    };

    while (pending.size > 0) {
      ensureNotAborted(signal);
      for (const step of workflow.steps) {
        if (!pending.has(step.id)) continue;
        const blockedBy = dependenciesFor(workflow, step).filter(
          (dependency) =>
            steps[dependency]?.status === "failed" || steps[dependency]?.status === "skipped",
        );
        if (!blockedBy.length) continue;
        const now = Date.now();
        const skippedStep: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "skipped",
          outputs: {},
          artifacts: [],
          startedAt: now,
          completedAt: now,
          duration: 0,
          blockedBy,
          ...(step.phases?.length
            ? {
                phases: step.phases.map((phase) => ({
                  ...phase,
                  status: "not-reached" as const,
                  warnings: [] as string[],
                })),
              }
            : {}),
        };
        steps[step.id] = skippedStep;
        pending.delete(step.id);
        for (const phase of step.phases ?? []) {
          emit({
            type: "phase.not-reached",
            stepId: step.id,
            phaseId: phase.id,
            title: phase.title,
          });
        }
        emit({ type: "step.skipped", stepId: step.id, uses: step.uses, blockedBy });
      }
      if (pending.size === 0) break;
      const ready = workflow.steps.filter(
        (step) =>
          pending.has(step.id) &&
          dependenciesFor(workflow, step).every(
            (dependency) => steps[dependency]?.status === "completed",
          ),
      );

      if (ready.length === 0) {
        throw new Error("Workflow dependencies contain a cycle");
      }

      const batch = ready;
      const results = await Promise.allSettled(batch.map((step) => runStep(step)));
      batch.forEach((step) => pending.delete(step.id));

      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure && failFast) {
        const failedStepId = batch[results.findIndex((result) => result.status === "rejected")].id;
        const now = Date.now();
        for (const step of workflow.steps) {
          if (!pending.has(step.id)) continue;
          const skippedStep: WorkflowStepResult = {
            id: step.id,
            uses: step.uses,
            status: "skipped",
            outputs: {},
            artifacts: [],
            startedAt: now,
            completedAt: now,
            duration: 0,
            blockedBy: [failedStepId],
            ...(step.phases?.length
              ? {
                  phases: step.phases.map((phase) => ({
                    ...phase,
                    status: "not-reached" as const,
                    warnings: [] as string[],
                  })),
                }
              : {}),
          };
          steps[step.id] = skippedStep;
          pending.delete(step.id);
          for (const phase of step.phases ?? []) {
            emit({
              type: "phase.not-reached",
              stepId: step.id,
              phaseId: phase.id,
              title: phase.title,
            });
          }
          emit({
            type: "step.skipped",
            stepId: step.id,
            uses: step.uses,
            blockedBy: [failedStepId],
          });
        }
        throw failure.reason;
      }
    }

    const result: WorkflowResult = {
      status: Object.values(steps).some((step) => step.status !== "completed")
        ? "completed-with-errors"
        : "completed",
      version: context.version,
      outputs,
      artifacts,
      deliveries: workflow.steps
        .map((step) => steps[step.id]?.delivery)
        .filter((delivery): delivery is NonNullable<typeof delivery> => Boolean(delivery)),
      steps,
    };
    const safeResult = valueResolver.redactResultPreservingArtifactPaths(result);
    emit({ type: "workflow.completed", result: safeResult, duration: Date.now() - startedAt });
    return safeResult;
  } catch (error) {
    const normalized = signal.aborted ? abortError(signal.reason) : toError(error);
    const serialized = serializeError(normalized, redact);
    for (const step of workflow.steps) {
      if (steps[step.id]) continue;
      for (const phase of step.phases ?? []) {
        emit({
          type: "phase.not-reached",
          stepId: step.id,
          phaseId: phase.id,
          title: phase.title,
        });
      }
    }
    emit({
      type: "workflow.failed",
      error: serialized,
      duration: Date.now() - startedAt,
    });
    const safeError = new Error(serialized.message);
    safeError.name = serialized.name;
    throw safeError;
  }
};
