import type { ArtifactRef, ReleaseConfig, ReleaseOutputRef, ReleasePlan } from "./types";

/**
 * Keys (`buildId:targetId`) of the build outputs something active reads: an enabled deployment slot
 * of an enabled destination, or a build's input.
 * This is purely syntactic: a build without an `input` is wired by the planner, so prefer
 * {@link plannedUsedTargetKeys} whenever a plan is available. A target is "used" exactly when its key
 * is here; every target of a build otherwise exists and keeps its settings.
 */
export const usedTargetKeys = (config: ReleaseConfig): Set<string> => {
  const keys = new Set<string>();
  const add = (ref?: ReleaseOutputRef) => {
    if (ref && "buildId" in ref) keys.add(`${ref.buildId}:${ref.targetId}`);
  };
  for (const destination of config.destinations ?? []) {
    if (!destination.enabled) continue;
    for (const slot of destination.slots) if (slot.enabled) add(slot.input);
  }
  for (const build of config.builds ?? []) {
    add(build.input);
    for (const input of build.inputs ?? []) add(input);
  }
  return keys;
};

/** Id prefix of producers the planner inserts itself (automatic transforms). */
export const AUTOMATIC_PRODUCER_PREFIX = "__auto__";

const isSourceRef = (ref: ArtifactRef): ref is { source: true } =>
  "source" in ref && ref.source === true;

/**
 * Keys (`producerId:outputId`) of the producer outputs that something reads: each enabled
 * destination slot, and transitively every input of a producer that has a consumed output.
 * Exposed but unconsumed outputs are not in the set and are not compiled.
 */
export const consumedOutputKeys = (plan: ReleasePlan): Set<string> => {
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

/**
 * Keys (`buildId:targetId`) of the build outputs the plan consumes, including the ones the planner
 * wired implicitly (a build without an explicit `input`). Automatic producers are not builds.
 */
export const plannedUsedTargetKeys = (plan: ReleasePlan): Set<string> =>
  new Set(
    [...consumedOutputKeys(plan)].filter((key) => !key.startsWith(AUTOMATIC_PRODUCER_PREFIX)),
  );
