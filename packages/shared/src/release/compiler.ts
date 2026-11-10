import { planRelease } from "./planner";
import { RELEASE_BEFORE_BUILD_TASK_ID } from "./types";
import type {
  ArtifactRef,
  CompiledArtifact,
  CompiledInput,
  CompiledProducer,
  ReleaseCompileContext,
  ReleaseConfig,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseProducerConfig,
  ReleaseRegistry,
} from "./types";
import { isSafePersistedId } from "../persisted-id";
import type { Workflow, WorkflowStep } from "@pipelab/workflow-runtime";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime/task-ids";

const provider = <T extends { id: string }>(providers: T[], id: string, kind: string): T => {
  const result = providers.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Unknown release ${kind} provider: ${id}`);
  return result;
};

const isSourceRef = (ref: ArtifactRef): ref is { source: true } =>
  "source" in ref && ref.source === true;

/**
 * Keys (`producerId:outputId`) of the producer outputs that something reads: each enabled
 * destination slot, and transitively every input of a producer that has a consumed output.
 * Exposed but unconsumed outputs are not in the set and are not compiled.
 */
const consumedOutputKeys = (plan: ReleasePlan): Set<string> => {
  const producers = new Map(plan.producers.map((item) => [item.id, item]));
  const consumed = new Set<string>();
  const pending: ArtifactRef[] = plan.destinations.flatMap((destination) =>
    destination.slots.flatMap((slot) => (slot.input ? [slot.input] : [])),
  );
  while (pending.length) {
    const ref = pending.pop()!;
    if (isSourceRef(ref)) continue;
    const key = `${ref.producerId}:${ref.outputId}`;
    if (consumed.has(key)) continue;
    consumed.add(key);
    const producer = producers.get(ref.producerId);
    if (producer) pending.push(...(producer.inputs ?? (producer.input ? [producer.input] : [])));
  }
  return consumed;
};

const toOutputRef = (ref: ArtifactRef): ReleaseOutputRef =>
  isSourceRef(ref) ? { source: true } : { buildId: ref.producerId, targetId: ref.outputId };

/** Stable, folder-safe label for a multi-input producer's input. */
const inputLabel = (ref: ArtifactRef): string =>
  isSourceRef(ref)
    ? "source"
    : `${ref.producerId}-${ref.outputId}`.replace(/[^A-Za-z0-9._-]+/g, "-");

const addArtifactDependencies = (step: WorkflowStep): WorkflowStep => {
  const artifactDependencies = Object.values(step.artifactInputs ?? {}).map(
    (reference) => reference.stepId,
  );
  if (!artifactDependencies.length) return step;
  return {
    ...step,
    needs: [...new Set([...(step.needs ?? []), ...artifactDependencies])],
  };
};

const compileErrors = (plan: { issues: Array<{ severity: string; message: string }> }): string[] =>
  plan.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);

const validateCompiledArtifact = (
  artifact: CompiledArtifact,
  steps: readonly WorkflowStep[],
  owner: string,
): void => {
  const step = steps.find((candidate) => candidate.id === artifact.reference.stepId);
  if (!step)
    throw new Error(
      `Compiled ${owner} artifact "${artifact.reference.artifact}" references unknown workflow step "${artifact.reference.stepId}".`,
    );
  if (
    !step.artifacts ||
    !Object.prototype.hasOwnProperty.call(step.artifacts, artifact.reference.artifact)
  )
    throw new Error(
      `Compiled ${owner} artifact references undeclared artifact "${artifact.reference.artifact}" on workflow step "${artifact.reference.stepId}".`,
    );
};

export const compileReleasePlan = (
  configuration: ReleaseConfig,
  plan: ReleasePlan,
  registry: ReleaseRegistry,
  context: ReleaseCompileContext,
): Workflow => {
  const errors = compileErrors(plan);
  if (errors.length) throw new Error(errors.join("\n"));

  const sourceDefinition = provider(registry.sources, configuration.source.provider, "source");
  const source = sourceDefinition.compile(configuration.source.config, context);
  const steps: WorkflowStep[] = source.steps.map(addArtifactDependencies);
  validateCompiledArtifact(source.artifact, steps, "source");
  // Producers compile against the same source configuration the source was compiled from.
  const producerContext: ReleaseCompileContext = {
    ...context,
    sourceConfig: configuration.source.config,
  };
  const artifacts = new Map<string, CompiledArtifact>([["source", source.artifact]]);
  const states = new Map<string, "visiting" | "compiled">();
  const producers = new Map(plan.producers.map((item) => [item.id, item]));
  const consumed = consumedOutputKeys(plan);
  // Producers see only the targets that are consumed; the planned configuration is left untouched.
  const withConsumedTargets = (producer: ReleaseProducerConfig): ReleaseProducerConfig => ({
    ...producer,
    targets: producer.targets.map((target) => ({
      ...target,
      enabled: target.enabled && consumed.has(`${producer.id}:${target.id}`),
    })),
  });
  const buildProfiles = new Map(configuration.builds.map((item) => [item.id, item]));

  const compileBeforeBuildHooks = (
    producerId: string,
    input: CompiledArtifact,
    supportsHooks: boolean | undefined,
  ): { steps: WorkflowStep[]; artifact: CompiledArtifact } => {
    const profile = buildProfiles.get(producerId);
    const hooks = profile?.beforeBuild?.filter((hook) => hook.enabled) ?? [];
    if (!hooks.length) return { steps: [], artifact: input };
    if (!isSafePersistedId(producerId) || hooks.some((hook) => !isSafePersistedId(hook.id)))
      throw new Error(`Build profile ${producerId} has an unsafe beforeBuild hook ID.`);
    if (!supportsHooks)
      throw new Error(`Build profile ${producerId} has beforeBuild hooks its producer cannot run.`);
    if (input.descriptor.container !== "directory")
      throw new Error(`Build profile ${producerId} beforeBuild hooks require a directory input.`);

    const stageId = `release-hook-copy-${producerId}`;
    const compiledSteps: WorkflowStep[] = [
      {
        id: stageId,
        uses: CORE_WORKFLOW_TASKS.copy,
        needs: [input.reference.stepId],
        artifactInputs: { from: input.reference },
        with: {
          to: "${{ variables.buildStaging }}/" + producerId,
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
        artifacts: { output: { descriptor: input.descriptor } },
      },
    ];
    let artifact: CompiledArtifact = {
      reference: { stepId: stageId, artifact: "output" },
      descriptor: input.descriptor,
    };

    for (const hook of hooks) {
      const hookStepId = `release-before-build-${producerId}-${hook.id}`;
      compiledSteps.push({
        id: hookStepId,
        uses: RELEASE_BEFORE_BUILD_TASK_ID,
        needs: [artifact.reference.stepId],
        artifactInputs: { input: artifact.reference },
        with: {
          profileId: producerId,
          profileName: profile?.name || producerId,
          hookId: hook.id,
          command: hook.command,
        },
        artifacts: { output: { descriptor: artifact.descriptor } },
      });
      artifact = {
        reference: { stepId: hookStepId, artifact: "output" },
        descriptor: artifact.descriptor,
      };
    }

    return { steps: compiledSteps, artifact };
  };

  const resolveInput = (inputRef: ArtifactRef): CompiledArtifact => {
    if (!isSourceRef(inputRef)) compileProducer(inputRef.producerId);
    const input = artifacts.get(
      isSourceRef(inputRef) ? "source" : `${inputRef.producerId}:${inputRef.outputId}`,
    );
    if (!input)
      throw new Error(
        `Producer references an unknown artifact ${isSourceRef(inputRef) ? "source" : `${inputRef.producerId}/${inputRef.outputId}`}.`,
      );
    return input;
  };

  const compileProducer = (producerId: string): void => {
    if (states.get(producerId) === "compiled") return;
    if (states.get(producerId) === "visiting")
      throw new Error(`Producer cycle detected at ${producerId}.`);
    const producer = producers.get(producerId);
    if (!producer)
      throw new Error(`Producer references an unknown artifact producer ${producerId}.`);
    if (!producer.enabled) throw new Error(`Producer ${producerId} is not enabled.`);
    const definition = provider(registry.producers, producer.provider, "producer");
    const compilable = withConsumedTargets(producer);
    let compiled: CompiledProducer;
    if (definition.inputs === "many") {
      if (!producer.inputs?.length)
        throw new Error(`Producer ${producer.id} is missing its artifact inputs.`);
      states.set(producerId, "visiting");
      const inputs: CompiledInput[] = producer.inputs.map((inputRef) => ({
        artifact: resolveInput(inputRef),
        ref: toOutputRef(inputRef),
        label: inputLabel(inputRef),
      }));
      if (!definition.compileMany)
        throw new Error(
          `Producer ${definition.id} consumes several inputs but does not implement compileMany.`,
        );
      compiled = definition.compileMany(inputs, compilable, producerContext);
    } else {
      if (!producer.input) throw new Error(`Producer ${producer.id} is missing an artifact input.`);
      states.set(producerId, "visiting");
      const input = resolveInput(producer.input);
      const hookedInput = compileBeforeBuildHooks(
        producerId,
        input,
        definition.supportsBeforeBuildHooks,
      );
      steps.push(...hookedInput.steps);
      compiled = definition.compile(hookedInput.artifact, compilable, producerContext);
    }
    const compiledSteps = compiled.steps.map(addArtifactDependencies);
    for (const target of compilable.targets.filter((item) => item.enabled)) {
      if (!compiled.artifacts[target.id])
        throw new Error(`Producer ${producer.id} did not compile artifact ${target.id}.`);
    }
    steps.push(...compiledSteps);
    for (const [outputId, artifact] of Object.entries(compiled.artifacts)) {
      validateCompiledArtifact(artifact, steps, `producer ${producer.id}`);
      artifacts.set(`${producer.id}:${outputId}`, artifact);
    }
    states.set(producerId, "compiled");
  };

  // A producer is compiled only when at least one of its targets is consumed.
  for (const producer of plan.producers.filter(
    (item) =>
      item.enabled && item.targets.some((target) => consumed.has(`${item.id}:${target.id}`)),
  ))
    compileProducer(producer.id);
  for (const destination of plan.destinations) {
    const definition = provider(registry.destinations, destination.provider, "destination");
    for (const slot of destination.slots.filter((item) => item.enabled)) {
      if (!slot.input)
        throw new Error(
          `Destination ${destination.id} slot ${slot.id} has no configured artifact input.`,
        );
      const artifact = artifacts.get(
        isSourceRef(slot.input) ? "source" : `${slot.input.producerId}:${slot.input.outputId}`,
      );
      if (!artifact)
        throw new Error(
          `Destination ${destination.id} references an unknown artifact ${isSourceRef(slot.input) ? "source" : `${slot.input.producerId}/${slot.input.outputId}`}.`,
        );
      steps.push(
        ...definition.compile(artifact, destination, slot, context).map(addArtifactDependencies),
      );
    }
  }
  // A destination that already shipped cannot be rolled back, so by default one failure does not
  // stop the independent steps that remain.
  return { version: 1, steps, continueOnError: configuration.continueOnError ?? true };
};

export const compileWorkflow = (
  configuration: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleaseCompileContext,
): Workflow => {
  const plan = planRelease(configuration, registry, context);
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));
  return compileReleasePlan(configuration, plan, registry, context);
};
