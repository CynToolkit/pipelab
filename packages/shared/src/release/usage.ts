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

/**
 * The parts of a workflow that something uses, in the shape {@link ReleasePlan} already has: a
 * producer with its used targets, and an enabled destination with its enabled slots. A real plan
 * satisfies it; {@link usedSelectionFromConfig} is the syntactic stand-in when no plan exists.
 */
export interface UsedValueSelection {
  producers: ReadonlyArray<{
    provider: string;
    config: Record<string, unknown>;
    targets: ReadonlyArray<{ id: string; enabled: boolean; config: Record<string, unknown> }>;
  }>;
  destinations: ReadonlyArray<{
    provider: string;
    config: Record<string, unknown>;
    slots: ReadonlyArray<{ enabled: boolean; config: Record<string, unknown> }>;
  }>;
}

/** Selection from the saved config alone: use only when no plan is available (see {@link usedTargetKeys}). */
export const usedSelectionFromConfig = (config: ReleaseConfig): UsedValueSelection => {
  const used = usedTargetKeys(config);
  return {
    producers: (config.builds ?? []).map((build) => ({
      provider: build.engine,
      config: build.config,
      targets: build.targets.map((target) => ({
        id: target.id,
        enabled: used.has(`${build.id}:${target.id}`),
        config: target.config,
      })),
    })),
    destinations: (config.destinations ?? [])
      .filter((destination) => destination.enabled)
      .map((destination) => ({
        provider: destination.provider,
        config: destination.config,
        slots: destination.slots,
      })),
  };
};

type FieldBearer<TField> = { fields?: readonly TField[] };

/** Field definitions a walk reads: the release registry and the renderer catalog both fit. */
export interface UsedValueDefinitions<TField> {
  sources: ReadonlyArray<FieldBearer<TField> & { id: string }>;
  producers: ReadonlyArray<
    FieldBearer<TField> & {
      id: string;
      targets: ReadonlyArray<FieldBearer<TField> & { id: string }>;
    }
  >;
  destinations: ReadonlyArray<FieldBearer<TField> & { id: string; slotFields?: readonly TField[] }>;
}

/**
 * Visits every field value a run reads: the source, each producer that has a used target and those
 * targets, and each enabled slot of each destination. This is the one definition of "what the
 * workflow uses" for values (environment bindings, Connections); callers differ only in what they
 * do with a field and its value.
 */
export const forEachUsedValue = <TField extends { key: string }>(
  config: ReleaseConfig,
  selection: UsedValueSelection,
  definitions: UsedValueDefinitions<TField>,
  visit: (field: TField, value: unknown) => void,
) => {
  const collect = (fields: readonly TField[] | undefined, values: Record<string, unknown>) => {
    for (const field of fields ?? []) visit(field, values[field.key]);
  };

  const source = definitions.sources.find((candidate) => candidate.id === config.source.provider);
  collect(source?.fields, config.source.config);

  for (const producer of selection.producers) {
    const usedTargets = producer.targets.filter((target) => target.enabled);
    // A build nothing reads is not compiled, so it contributes no values.
    if (usedTargets.length === 0) continue;
    const definition = definitions.producers.find(
      (candidate) => candidate.id === producer.provider,
    );
    collect(definition?.fields, producer.config);
    for (const target of usedTargets) {
      const targetDefinition = definition?.targets.find((candidate) => candidate.id === target.id);
      collect(targetDefinition?.fields, target.config);
    }
  }

  for (const destination of selection.destinations) {
    const definition = definitions.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    collect(definition?.fields, destination.config);
    for (const slot of destination.slots) {
      if (slot.enabled) collect(definition?.slotFields, slot.config);
    }
  }
};
