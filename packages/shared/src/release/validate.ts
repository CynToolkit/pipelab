import { matchesArtifact } from "./matcher";
import { validateReleaseConfigShape } from "./config";
import type { ArtifactDescriptor } from "@pipelab/workflow-runtime";
import type { ArtifactRef, ReleaseConfig, ReleaseRegistry, ReleaseValidationContext, ValidationIssue } from "./types";

const error = (code: string, message: string, path?: string): ValidationIssue => ({ code, message, severity: "error", path });
const isSourceRef = (ref: ArtifactRef): ref is { source: true } => "source" in ref && ref.source === true;

export const validateRelease = (config: ReleaseConfig, registry: ReleaseRegistry, context: ReleaseValidationContext): ValidationIssue[] => {
  const issues = [...validateReleaseConfigShape(config)];
  if (issues.some((issue) => issue.severity === "error")) return issues;
  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  if (!source) return [...issues, error("release.source.unknown", `Unknown source provider: ${config.source.provider}`, "source.provider")];
  issues.push(...source.validate(config.source.config));

  const producerIds = new Set<string>();
  const producerDefinitions = new Map(config.producers.map((producer) => [producer.id, registry.producers.find((definition) => definition.id === producer.provider)]));
  const targetOutputs = new Map<string, ArtifactDescriptor>();
  const producerInputRefs = new Map<string, ArtifactRef>();
  for (const [producerIndex, producer] of config.producers.entries()) {
    const producerPath = `producers.${producerIndex}`;
    if (producerIds.has(producer.id)) issues.push(error("release.producer.id.duplicate", `Producer ID is not unique: ${producer.id}`, `${producerPath}.id`));
    producerIds.add(producer.id);
    const definition = producerDefinitions.get(producer.id);
    if (!definition) { issues.push(error("release.producer.unknown", `Unknown producer provider: ${producer.provider}`, `${producerPath}.provider`)); continue; }
    const input = producer.input ?? { source: true };
    producerInputRefs.set(producer.id, input);
    const inputDefinition = isSourceRef(input) ? source.output : producerDefinitions.get(input.producerId);
    if (!isSourceRef(input) && !config.producers.some((candidate) => candidate.id === input.producerId)) issues.push(error("release.producer.input.unknown", `Producer ${producer.id} references unknown producer ${input.producerId}.`, `${producerPath}.input`));
    const staticInput = isSourceRef(input) ? source.output : inputDefinition && "targets" in inputDefinition ? inputDefinition.targets.find((target) => target.id === input.outputId)?.output : undefined;
    if (staticInput && !matchesArtifact(staticInput, definition.accepts)) issues.push(error("release.producer.input.incompatible", `Producer ${producer.id} cannot consume its selected artifact.`, `${producerPath}.input`));
    issues.push(...definition.validate(producer, { ...context, source: staticInput || source.output, sourceConfig: config.source.config }));
    const targets = new Set<string>();
    for (const [targetIndex, target] of producer.targets.entries()) {
      const targetPath = `${producerPath}.targets.${targetIndex}`;
      if (targets.has(target.id)) issues.push(error("release.target.id.duplicate", `Target ID is not unique within producer ${producer.id}: ${target.id}`, `${targetPath}.id`));
      targets.add(target.id);
      const targetDefinition = definition.targets.find((candidate) => candidate.id === target.id);
      if (!targetDefinition) { issues.push(error("release.target.unknown", `Unknown target ${target.id} for producer ${producer.provider}.`, `${targetPath}.id`)); continue; }
      if (target.enabled && targetDefinition.isAvailable) { const availability = targetDefinition.isAvailable(context.host); if (!availability.available) issues.push(error("release.target.unavailable", availability.reason ?? `Target ${target.id} is not available on this host.`, targetPath)); }
      if (producer.enabled && target.enabled && targetDefinition.output) targetOutputs.set(`${producer.id}:${target.id}`, targetDefinition.output);
    }
  }

  const visit = (producerId: string, stack: string[]): void => {
    if (stack.includes(producerId)) { issues.push(error("release.producer.input.cycle", `Producer cycle detected: ${[...stack, producerId].join(" → ")}`, `producers.${producerId}.input`)); return; }
    const input = producerInputRefs.get(producerId);
    if (input && !isSourceRef(input) && producerInputRefs.has(input.producerId)) visit(input.producerId, [...stack, producerId]);
  };
  for (const producer of config.producers) visit(producer.id, []);

  for (const [destinationIndex, destination] of config.destinations.entries()) {
    const destinationPath = `destinations.${destinationIndex}`;
    const definition = registry.destinations.find((candidate) => candidate.id === destination.provider);
    if (!definition) { issues.push(error("release.destination.unknown", `Unknown destination provider: ${destination.provider}`, `${destinationPath}.provider`)); continue; }
    issues.push(...definition.validate(destination, context));
    const enabledSlots = destination.slots.filter((slot) => slot.enabled);
    if (destination.enabled && enabledSlots.length === 0) issues.push(error("release.destination.slot.required", `Destination ${destination.id} must have an enabled slot.`, `${destinationPath}.slots`));
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled) continue;
      const slotPath = `${destinationPath}.slots.${slotIndex}`;
      const descriptor = isSourceRef(slot.input) ? source.output : targetOutputs.get(`${slot.input.producerId}:${slot.input.outputId}`);
      if (!isSourceRef(slot.input)) {
        const producerRef = slot.input;
        if (!targetOutputs.has(`${producerRef.producerId}:${producerRef.outputId}`) && config.producers.some((producer) => producer.id === producerRef.producerId)) continue;
      }
      if (!descriptor) { issues.push(error("release.destination.artifact.unknown", `Destination ${destination.id} references an unknown artifact.`, `${slotPath}.input`)); continue; }
      if (!matchesArtifact(descriptor, definition.accepts)) issues.push(error("release.destination.input.incompatible", `Destination ${destination.id} cannot consume the selected artifact.`, slotPath));
    }
  }
  return issues;
};
