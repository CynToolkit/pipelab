import { matchesArtifact } from "./matcher";
import { validateReleaseConfigShape } from "./config";
import type {
  ReleaseConfig,
  ReleaseRegistry,
  ReleaseValidationContext,
  ValidationIssue,
} from "./types";

const error = (code: string, message: string, path?: string): ValidationIssue => ({ code, message, severity: "error", path });

export const validateRelease = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleaseValidationContext,
): ValidationIssue[] => {
  const issues = [...validateReleaseConfigShape(config)];
  if (issues.some((issue) => issue.severity === "error")) return issues;

  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  if (!source) {
    issues.push(error("release.source.unknown", `Unknown source provider: ${config.source.provider}`, "source.provider"));
    return issues;
  }
  issues.push(...source.validate(config.source.config));

  const producerIds = new Set<string>();
  const producerArtifacts = new Map<string, { descriptor: typeof source.output }>();
  for (const [producerIndex, producer] of config.producers.entries()) {
    const producerPath = `producers.${producerIndex}`;
    if (producerIds.has(producer.id)) issues.push(error("release.producer.id.duplicate", `Producer ID is not unique: ${producer.id}`, `${producerPath}.id`));
    producerIds.add(producer.id);
    const definition = registry.producers.find((candidate) => candidate.id === producer.provider);
    if (!definition) {
      issues.push(error("release.producer.unknown", `Unknown producer provider: ${producer.provider}`, `${producerPath}.provider`));
      continue;
    }
    if (!matchesArtifact(source.output, definition.accepts)) issues.push(error("release.producer.input.incompatible", `Producer ${producer.id} cannot consume the source artifact.`, producerPath));
    issues.push(...definition.validate(producer, { ...context, source: source.output }));
    const targets = new Set<string>();
    for (const [targetIndex, target] of producer.targets.entries()) {
      const targetPath = `${producerPath}.targets.${targetIndex}`;
      if (targets.has(target.id)) issues.push(error("release.target.id.duplicate", `Target ID is not unique within producer ${producer.id}: ${target.id}`, `${targetPath}.id`));
      targets.add(target.id);
      const targetDefinition = definition.targets.find((candidate) => candidate.id === target.id);
      if (!targetDefinition) {
        issues.push(error("release.target.unknown", `Unknown target ${target.id} for producer ${producer.provider}.`, `${targetPath}.id`));
        continue;
      }
      if (target.enabled && targetDefinition.isAvailable) {
        const availability = targetDefinition.isAvailable(context.host);
        if (!availability.available) issues.push(error("release.target.unavailable", availability.reason ?? `Target ${target.id} is not available on this host.`, targetPath));
      }
      if (producer.enabled && target.enabled) producerArtifacts.set(`${producer.id}:${target.id}`, { descriptor: targetDefinition.output });
    }
  }

  for (const [destinationIndex, destination] of config.destinations.entries()) {
    const destinationPath = `destinations.${destinationIndex}`;
    const definition = registry.destinations.find((candidate) => candidate.id === destination.provider);
    if (!definition) {
      issues.push(error("release.destination.unknown", `Unknown destination provider: ${destination.provider}`, `${destinationPath}.provider`));
      continue;
    }
    issues.push(...definition.validate(destination, context));
    const enabledSlots = destination.slots.filter((slot) => slot.enabled);
    if (destination.enabled && enabledSlots.length === 0) issues.push(error("release.destination.slot.required", `Destination ${destination.id} must have an enabled slot.`, `${destinationPath}.slots`));
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled) continue;
      const slotPath = `${destinationPath}.slots.${slotIndex}`;
      const artifact = producerArtifacts.get(`${slot.input.producerId}:${slot.input.outputId}`);
      if (!artifact) {
        issues.push(error("release.destination.artifact.unknown", `Destination ${destination.id} references an unknown producer artifact.`, `${slotPath}.input`));
        continue;
      }
      if (!matchesArtifact(artifact.descriptor, definition.accepts)) issues.push(error("release.destination.input.incompatible", `Destination ${destination.id} cannot consume ${slot.input.outputId}.`, slotPath));
    }
  }
  return issues;
};
