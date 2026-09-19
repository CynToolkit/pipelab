import type { ReleaseCatalog, ReleaseConfig, ReleaseCompileContext } from "@pipelab/shared";
import { matchesArtifact, validateReleaseConfigShape } from "@pipelab/shared";
import type { Workflow, WorkflowStep } from "./types";

const findProvider = <T extends { id: string }>(providers: T[], id: string, kind: string): T => {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown release ${kind} provider: ${id}`);
  return provider;
};

export const compileWorkflow = (
  configuration: ReleaseConfig,
  catalog: ReleaseCatalog,
  context: ReleaseCompileContext,
): Workflow => {
  const shapeIssues = validateReleaseConfigShape(configuration);
  const errors = shapeIssues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));

  const sourceDefinition = findProvider(catalog.sources, configuration.source.provider, "source");
  const source = sourceDefinition.compile(configuration.source.config, context);
  const steps: WorkflowStep[] = [...source.steps];
  const artifacts = new Map<string, { reference: { stepId: string; artifact: string }; descriptor: import("@pipelab/shared").ArtifactDescriptor }>();

  for (const producer of configuration.producers.filter((item) => item.enabled)) {
    const definition = findProvider(catalog.producers, producer.provider, "producer");
    if (!matchesArtifact(source.artifact.descriptor, definition.accepts)) {
      throw new Error(`Producer ${producer.id} cannot consume the source artifact.`);
    }
    const enabledTargets = producer.targets.filter((target) => target.enabled);
    const compiled = definition.compile(source.artifact.reference, { ...producer, targets: enabledTargets }, context);
    steps.push(...compiled.steps);
    for (const [outputId, artifact] of Object.entries(compiled.artifacts)) {
      artifacts.set(`${producer.id}:${outputId}`, artifact);
    }
  }

  for (const destination of configuration.destinations.filter((item) => item.enabled)) {
    const definition = findProvider(catalog.destinations, destination.provider, "destination");
    for (const slot of destination.slots.filter((item) => item.enabled)) {
      const artifact = artifacts.get(`${slot.input.producerId}:${slot.input.outputId}`);
      if (!artifact) throw new Error(`Destination ${destination.id} references an unknown producer artifact.`);
      if (!matchesArtifact(artifact.descriptor, definition.accepts)) throw new Error(`Destination ${destination.id} cannot consume producer artifact ${slot.input.outputId}.`);
      const compiled = definition.compile(artifact.reference, destination, slot, context);
      steps.push(...compiled);
    }
  }

  return { version: 1, steps, continueOnError: configuration.continueOnError ?? false };
};
