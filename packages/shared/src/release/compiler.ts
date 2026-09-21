import { planRelease } from "./planner";
import type {
  ArtifactRef,
  CompiledArtifact,
  ReleaseCompileContext,
  ReleaseConfig,
  ReleasePlan,
  ReleaseRegistry,
} from "./types";
import type { Workflow, WorkflowStep } from "@pipelab/workflow-runtime";

const provider = <T extends { id: string }>(providers: T[], id: string, kind: string): T => {
  const result = providers.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Unknown release ${kind} provider: ${id}`);
  return result;
};

const isSourceRef = (ref: ArtifactRef): ref is { source: true } =>
  "source" in ref && ref.source === true;

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
  const artifacts = new Map<string, CompiledArtifact>([["source", source.artifact]]);
  const states = new Map<string, "visiting" | "compiled">();
  const producers = new Map(plan.producers.map((item) => [item.id, item]));

  const compileProducer = (producerId: string): void => {
    if (states.get(producerId) === "compiled") return;
    if (states.get(producerId) === "visiting")
      throw new Error(`Producer cycle detected at ${producerId}.`);
    const producer = producers.get(producerId);
    if (!producer)
      throw new Error(`Producer references an unknown artifact producer ${producerId}.`);
    if (!producer.enabled) throw new Error(`Producer ${producerId} is not enabled.`);
    if (!producer.input) throw new Error(`Producer ${producer.id} is missing an artifact input.`);
    states.set(producerId, "visiting");
    const definition = provider(registry.producers, producer.provider, "producer");
    const inputRef = producer.input;
    if (!isSourceRef(inputRef)) compileProducer(inputRef.producerId);
    const input = artifacts.get(
      isSourceRef(inputRef) ? "source" : `${inputRef.producerId}:${inputRef.outputId}`,
    );
    if (!input)
      throw new Error(
        `Producer ${producer.id} references an unknown artifact ${isSourceRef(inputRef) ? "source" : `${inputRef.producerId}/${inputRef.outputId}`}.`,
      );
    const compiled = definition.compile(input, producer, context);
    const compiledSteps = compiled.steps.map(addArtifactDependencies);
    for (const target of producer.targets.filter((item) => item.enabled)) {
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

  for (const producer of plan.producers.filter((item) => item.enabled))
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
  return { version: 1, steps, continueOnError: configuration.continueOnError ?? false };
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
