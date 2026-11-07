import { nanoid } from "nanoid";
import { evaluateArtifactAcceptance } from "./matcher";
import { RELEASE_DEFAULTS, type ReleaseDefaultEntry } from "./defaults";
import { planArtifactAccepted, planRelease } from "./planner";
import type { ReleasePlanningContext } from "./planner";
import type {
  ArtifactDescriptor,
  PlannedReleaseOutput,
  ReleaseBuildProfileConfig,
  ReleaseConfig,
  ReleaseDestinationDefinition,
  ReleaseHostContext,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseProducerDefinition,
  ReleaseProducerTargetDefinition,
  ReleaseRegistry,
} from "./types";

/** The most builds the defaults add in one chain for one slot. */
const MAX_CHAIN_BUILDS = 4;

/** A defaults entry that can fill a build: its engine target is registered and available here. */
interface Candidate {
  entry: ReleaseDefaultEntry;
  producer: ReleaseProducerDefinition;
  target: ReleaseProducerTargetDefinition;
}

/** Fixed state of one resolution: the config being filled, its planning inputs and the candidates. */
interface ResolveScope {
  config: ReleaseConfig;
  registry: ReleaseRegistry;
  context: ReleasePlanningContext;
  candidates: Candidate[];
  /** Build types in table order; earlier types are preferred when an existing output is reused. */
  buildTypeOrder: string[];
}

/** Address of one destination slot in the config. */
interface SlotPosition {
  destinationIndex: number;
  slotIndex: number;
}

/** Builds to add, in order, and the output reference the slot or the next build reads. */
interface Feed {
  builds: ReleaseBuildProfileConfig[];
  ref: ReleaseOutputRef;
}

/** A consumer's acceptance test over an output descriptor. */
type Accepts = (artifact: ArtifactDescriptor) => boolean;

const cloneConfig = (config: ReleaseConfig): ReleaseConfig => structuredClone(config);

const slotInputPath = ({ destinationIndex, slotIndex }: SlotPosition) =>
  `destinations.${destinationIndex}.slots.${slotIndex}.input`;

const isSourceRef = (ref: ReleaseOutputRef): ref is { source: true } => "source" in ref;

const artifactRefOf = (ref: ReleaseOutputRef) =>
  isSourceRef(ref)
    ? { source: true as const }
    : { producerId: ref.buildId, outputId: ref.targetId };

const artifactRefEquals = (
  left: ReleasePlan["destinations"][number]["slots"][number]["input"] | undefined,
  right: ReturnType<typeof artifactRefOf>,
) =>
  Boolean(
    left &&
    ("source" in left
      ? "source" in right
      : "producerId" in right &&
        left.producerId === right.producerId &&
        left.outputId === right.outputId),
  );

const hasBlockingIssue = (plan: ReleasePlan, paths: string[]) =>
  plan.issues.some((issue) => {
    const issuePath = issue.path;
    return (
      issue.severity === "error" &&
      issuePath !== undefined &&
      paths.some((path) => issuePath === path || issuePath.startsWith(`${path}.`))
    );
  });

/** Whether the target is usable on this host. */
const isAvailable = (target: ReleaseProducerTargetDefinition, host: ReleaseHostContext) =>
  !target.isAvailable || target.isAvailable(host).available;

/** Whether the planner reports this slot as missing its input. */
const requiresInput = (plan: ReleasePlan, at: SlotPosition) =>
  plan.issues.some(
    (issue) =>
      issue.code === "release.destination.input.required" && issue.path === slotInputPath(at),
  );

/** The output technology of the configured source, when the source is registered. */
const sourceTechnologyOf = (config: ReleaseConfig, registry: ReleaseRegistry) =>
  registry.sources.find((source) => source.id === config.source.provider)?.output.technology;

/**
 * The defaults entries that can fill a build for this source on this host, in table order. A
 * source-specific entry removes the generic entries of its build type.
 */
const candidatesOf = (
  registry: ReleaseRegistry,
  host: ReleaseHostContext,
  defaults: ReleaseDefaultEntry[],
  sourceTechnology: string | undefined,
): Candidate[] => {
  const candidates = defaults.flatMap((entry): Candidate[] => {
    if (entry.source !== undefined && entry.source !== sourceTechnology) return [];
    const producer = registry.producers.find((item) => item.id === entry.engine);
    if (!producer || producer.planning.mode !== "build") return [];
    const target = producer.targets.find((item) => item.id === entry.target);
    if (!target || target.buildType !== entry.buildType || !isAvailable(target, host)) return [];
    return [{ entry, producer, target }];
  });
  return candidates.filter(
    (candidate) =>
      candidate.entry.source !== undefined ||
      !candidates.some(
        (other) =>
          other.entry.source !== undefined && other.entry.buildType === candidate.entry.buildType,
      ),
  );
};

/** A new build of one candidate that reads the given input. */
const newBuild = (candidate: Candidate, input: ReleaseOutputRef): ReleaseBuildProfileConfig => {
  const { entry, producer, target } = candidate;
  return {
    id: nanoid(),
    type: entry.buildType,
    engine: producer.id,
    enabled: true,
    input,
    config: producer.createDefaultConfig(),
    targets: producer.targets
      .filter((item) => item.buildType === entry.buildType)
      .map((item) =>
        item.id === target.id
          ? {
              id: item.id,
              enabled: true,
              config: { ...item.createDefaultConfig(), ...entry.targetConfig },
            }
          : { id: item.id, enabled: false, config: item.createDefaultConfig() },
      ),
  };
};

/**
 * Reuse rank of an output: the source first, then builds by the table's build type order, and builds
 * of build types the table does not name last. Equal ranks keep the planner order.
 */
const reuseRank = (scope: ResolveScope, output: PlannedReleaseOutput) => {
  if (!output.buildId) return -1;
  const type = scope.config.builds.find((build) => build.id === output.buildId)?.type;
  const index = type === undefined ? -1 : scope.buildTypeOrder.indexOf(type);
  return index === -1 ? scope.buildTypeOrder.length : index;
};

/**
 * Every feed that gives a consumer an output it accepts. An output already present (an existing build
 * or the source) is used alone and ends the chain. Otherwise each candidate whose output is accepted
 * adds a build that reads a feed for its own producer, in table order. A producer is never repeated in one chain.
 */
const feedsFor = (
  scope: ResolveScope,
  outputs: PlannedReleaseOutput[],
  accepts: Accepts,
  used: ReadonlySet<string>,
  remaining: number,
): Feed[] => {
  const reused = [...outputs]
    .sort((left, right) => reuseRank(scope, left) - reuseRank(scope, right))
    .find((output) => accepts(output.descriptor));
  if (reused) return [{ builds: [], ref: reused.ref }];
  if (remaining <= 0) return [];
  return scope.candidates.flatMap((candidate): Feed[] => {
    const { producer, target } = candidate;
    if (used.has(producer.id) || !target.output || !accepts(target.output)) return [];
    const inputs = feedsFor(
      scope,
      outputs,
      (artifact) => planArtifactAccepted(artifact, producer, scope.context.host).accepted,
      new Set([...used, producer.id]),
      remaining - 1,
    );
    return inputs.map((input): Feed => {
      const build = newBuild(candidate, input.ref);
      return {
        builds: [...input.builds, build],
        ref: { buildId: build.id, targetId: target.id },
      };
    });
  });
};

/** Whether the slot accepts the feed's last output without blocking issues on the slot or the new builds. */
const slotAcceptsFeed = (scope: ResolveScope, at: SlotPosition, feed: Feed) => {
  const { config, registry, context } = scope;
  const destination = config.destinations[at.destinationIndex];
  const slot = destination.slots[at.slotIndex];
  const firstIndex = config.builds.length;
  const previousInput = slot.input;
  config.builds.push(...feed.builds);
  slot.input = feed.ref;
  const plan = planRelease(config, registry, context);
  const buildPaths = feed.builds.map((_, offset) => `builds.${firstIndex + offset}`);
  // The planner omits disabled destinations and slots, so the planned slot is found by id.
  const plannedSlot = plan.destinations
    .find((item) => item.id === destination.id)
    ?.slots.find((item) => item.id === slot.id);
  const accepted =
    !hasBlockingIssue(plan, [...buildPaths, slotInputPath(at)]) &&
    artifactRefEquals(plannedSlot?.input, artifactRefOf(feed.ref));
  config.builds.splice(firstIndex);
  slot.input = previousInput;
  return accepted;
};

/** Destination acceptance of an output, as the planner evaluates it. */
const destinationAccepts =
  (definition: ReleaseDestinationDefinition, host: ReleaseHostContext): Accepts =>
  (artifact) =>
    evaluateArtifactAcceptance(
      artifact,
      definition.accepts,
      () =>
        definition.acceptsWhen?.(artifact, { host, destination: definition }) ?? { accepted: true },
    ).accepted;

/**
 * Fills one empty slot: reuse a compatible planner output, else add the first chain of builds, in
 * table order, that the slot accepts.
 */
const resolveSlot = (scope: ResolveScope, at: SlotPosition) => {
  const plan = planRelease(scope.config, scope.registry, scope.context);
  if (!requiresInput(plan, at)) return;
  const destinationConfig = scope.config.destinations[at.destinationIndex];
  const definition = scope.registry.destinations.find(
    (candidate) => candidate.id === destinationConfig.provider,
  );
  if (!definition) return;
  const feeds = feedsFor(
    scope,
    plan.outputs,
    destinationAccepts(definition, scope.context.host),
    new Set(),
    MAX_CHAIN_BUILDS,
  );
  const feed = feeds.find((candidate) => slotAcceptsFeed(scope, at, candidate));
  if (!feed) return;
  scope.config.builds.push(...feed.builds);
  scope.config.destinations[at.destinationIndex].slots[at.slotIndex].input = feed.ref;
};

/**
 * Fills the empty enabled slots of the config from the defaults table. Every build created here
 * stores its explicit input, so the saved config does not depend on destination order.
 */
export const resolveReleaseDefaults = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleasePlanningContext,
  defaults: ReleaseDefaultEntry[] = RELEASE_DEFAULTS,
): ReleaseConfig => {
  const resolved = cloneConfig(config);
  const scope: ResolveScope = {
    config: resolved,
    registry,
    context,
    candidates: candidatesOf(
      registry,
      context.host,
      defaults,
      sourceTechnologyOf(config, registry),
    ),
    buildTypeOrder: [...new Set(defaults.map((entry) => entry.buildType))],
  };

  for (const [destinationIndex, destination] of resolved.destinations.entries()) {
    if (!destination.enabled) continue;
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled || slot.input) continue;
      resolveSlot(scope, { destinationIndex, slotIndex });
    }
  }
  return resolved;
};
