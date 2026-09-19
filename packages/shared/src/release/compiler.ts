import { matchesArtifact } from "./matcher";
import { validateReleaseConfigShape } from "./config";
import { validateRelease } from "./validate";
import type { CompiledArtifact, ReleaseCompileContext, ReleaseConfig, ReleaseProducerConfig, ReleaseRegistry } from "./types";
import type { ArtifactRef } from "./types";
import type { Workflow, WorkflowStep } from "@pipelab/workflow-runtime";

const findProvider = <T extends { id: string }>(providers: T[], id: string, kind: string): T => {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown release ${kind} provider: ${id}`);
  return provider;
};
const isSourceRef = (ref: ArtifactRef): ref is { source: true } => "source" in ref && ref.source === true;

export const compileWorkflow = (configuration: ReleaseConfig, registry: ReleaseRegistry, context: ReleaseCompileContext): Workflow => {
  const shapeIssues = validateReleaseConfigShape(configuration);
  const shapeErrors = shapeIssues.filter((issue) => issue.severity === "error");
  if (shapeErrors.length) throw new Error(shapeErrors.map((issue) => issue.message).join("\n"));
  const validationErrors = validateRelease(configuration, registry, context).filter((issue) => issue.severity === "error");
  if (validationErrors.length) throw new Error(validationErrors.map((issue) => issue.message).join("\n"));

  const sourceDefinition = findProvider(registry.sources, configuration.source.provider, "source");
  const source = sourceDefinition.compile(configuration.source.config, context);
  if (JSON.stringify(source.artifact.descriptor) !== JSON.stringify(sourceDefinition.output)) throw new Error(`Source ${sourceDefinition.id} compiled an artifact different from its declared output.`);
  const steps: WorkflowStep[] = [...source.steps];
  const artifacts = new Map<string, CompiledArtifact>([["source", source.artifact]]);
  const producers = new Map(configuration.producers.map((producer) => [producer.id, producer]));
  const states = new Map<string, "visiting" | "compiled">();

  const compileProducer = (producerId: string): void => {
    if (states.get(producerId) === "compiled") return;
    if (states.get(producerId) === "visiting") throw new Error(`Producer cycle detected at ${producerId}.`);
    const producer = producers.get(producerId);
    if (!producer || !producer.enabled) throw new Error(`Producer ${producerId} is not enabled.`);
    states.set(producerId, "visiting");
    const definition = findProvider(registry.producers, producer.provider, "producer");
    const inputRef = producer.input ?? { source: true as const };
    if (!isSourceRef(inputRef)) compileProducer(inputRef.producerId);
    const input = artifacts.get(isSourceRef(inputRef) ? "source" : `${inputRef.producerId}:${inputRef.outputId}`);
    if (!input) throw new Error(`Producer ${producer.id} references an unknown artifact.`);
    if (!matchesArtifact(input.descriptor, definition.accepts)) throw new Error(`Producer ${producer.id} cannot consume its selected artifact.`);
    const compiled = definition.compile(input, producer, context);
    steps.push(...compiled.steps);
    for (const [outputId, artifact] of Object.entries(compiled.artifacts)) artifacts.set(`${producer.id}:${outputId}`, artifact);
    states.set(producerId, "compiled");
  };

  for (const producer of configuration.producers.filter((item) => item.enabled)) compileProducer(producer.id);
  for (const destination of configuration.destinations.filter((item) => item.enabled)) {
    const definition = findProvider(registry.destinations, destination.provider, "destination");
    for (const slot of destination.slots.filter((item) => item.enabled)) {
      const artifact = artifacts.get(isSourceRef(slot.input) ? "source" : `${slot.input.producerId}:${slot.input.outputId}`);
      if (!artifact) throw new Error(`Destination ${destination.id} references an unknown artifact.`);
      if (!matchesArtifact(artifact.descriptor, definition.accepts)) throw new Error(`Destination ${destination.id} cannot consume the selected artifact.`);
      steps.push(...definition.compile(artifact, destination, slot, context));
    }
  }
  return { version: 1, steps, continueOnError: configuration.continueOnError ?? false };
};
