import { descriptorsEqual, resolveTargetDescriptor } from "./descriptor";
import { planRelease } from "./planner";
import { validateReleaseConfigShape } from "./config";
import type { ArtifactRef, CompiledArtifact, ReleaseCompileContext, ReleaseConfig, ReleaseRegistry } from "./types";
import type { Workflow, WorkflowStep } from "@pipelab/workflow-runtime";

const provider = <T extends { id: string }>(providers: T[], id: string, kind: string): T => {
  const result = providers.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Unknown release ${kind} provider: ${id}`);
  return result;
};

const isSourceRef = (ref: ArtifactRef): ref is { source: true } => "source" in ref && ref.source === true;

export const compileWorkflow = (configuration: ReleaseConfig, registry: ReleaseRegistry, context: ReleaseCompileContext): Workflow => {
  const shapeIssues = validateReleaseConfigShape(configuration).filter((issue) => issue.severity === "error");
  if (shapeIssues.length) throw new Error(shapeIssues.map((issue) => issue.message).join("\n"));
  const plan = planRelease(configuration, registry, context);
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));

  const sourceDefinition = provider(registry.sources, configuration.source.provider, "source");
  const source = sourceDefinition.compile(configuration.source.config, context);
  if (!descriptorsEqual(source.artifact.descriptor, sourceDefinition.output)) throw new Error(`Source ${sourceDefinition.id} compiled an artifact different from its declared output.`);

  const steps: WorkflowStep[] = [...source.steps];
  const artifacts = new Map<string, CompiledArtifact>([["source", source.artifact]]);
  const states = new Map<string, "visiting" | "compiled">();
  const producers = new Map(plan.producers.map((item) => [item.id, item]));

  const compileProducer = (producerId: string): void => {
    if (states.get(producerId) === "compiled") return;
    if (states.get(producerId) === "visiting") throw new Error(`Producer cycle detected at ${producerId}.`);
    const config = producers.get(producerId);
    if (!config || !config.enabled) throw new Error(`Producer ${producerId} is not enabled.`);
    states.set(producerId, "visiting");
    const definition = provider(registry.producers, config.provider, "producer");
    const inputRef = config.input ?? { source: true as const };
    if (!isSourceRef(inputRef)) compileProducer(inputRef.producerId);
    const input = artifacts.get(isSourceRef(inputRef) ? "source" : `${inputRef.producerId}:${inputRef.outputId}`);
    if (!input) throw new Error(`Producer ${config.id} references an unknown artifact.`);
    const compiled = definition.compile(input, config, context);
    for (const target of config.targets.filter((item) => item.enabled)) {
      const targetDefinition = definition.targets.find((item) => item.id === target.id);
      if (!targetDefinition) throw new Error(`Producer ${config.id} references an unknown target ${target.id}.`);
      const expected = resolveTargetDescriptor(input.descriptor, targetDefinition);
      if (!expected) throw new Error(`Producer ${config.id} target ${target.id} does not declare an artifact descriptor.`);
      const actual = compiled.artifacts[target.id];
      if (!actual) throw new Error(`Producer ${config.id} did not compile artifact ${target.id}.`);
      if (!descriptorsEqual(expected, actual.descriptor)) throw new Error(`Producer ${config.id} compiled artifact ${target.id} with a descriptor different from its declared output.`);
    }
    steps.push(...compiled.steps);
    for (const [outputId, artifact] of Object.entries(compiled.artifacts)) artifacts.set(`${config.id}:${outputId}`, artifact);
    states.set(producerId, "compiled");
  };

  for (const producer of plan.producers.filter((item) => item.enabled)) compileProducer(producer.id);
  for (const destination of plan.destinations) {
    const definition = provider(registry.destinations, destination.provider, "destination");
    for (const slot of destination.slots.filter((item) => item.enabled)) {
      const artifact = artifacts.get(isSourceRef(slot.input) ? "source" : `${slot.input.producerId}:${slot.input.outputId}`);
      if (!artifact) throw new Error(`Destination ${destination.id} references an unknown artifact.`);
      steps.push(...definition.compile(artifact, destination, slot, context));
    }
  }
  return { version: 1, steps, continueOnError: configuration.continueOnError ?? false };
};
