import { nanoid } from "nanoid";
import { planRelease } from "./planner";
import type {
  ReleaseBuildProfileConfig,
  ReleaseConfig,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseRegistry,
} from "./types";
import type { ReleasePlanningContext } from "./planner";

export interface ReleaseBuildPreferences {
  buildTypes: Record<
    string,
    {
      engine?: string;
      targets?: string[];
    }
  >;
}

export const DEFAULT_RELEASE_BUILD_PREFERENCES: ReleaseBuildPreferences = {
  buildTypes: {
    desktop: {
      engine: "@pipelab/plugin-electron/producer",
      targets: ["windows-x64"],
    },
  },
};

export const getReleaseBuildPreferences = (): ReleaseBuildPreferences =>
  DEFAULT_RELEASE_BUILD_PREFERENCES;

const cloneConfig = (config: ReleaseConfig): ReleaseConfig =>
  JSON.parse(JSON.stringify(config)) as ReleaseConfig;

const artifactRefEquals = (
  left: ReleasePlan["destinations"][number]["slots"][number]["input"] | undefined,
  right: NonNullable<ReleasePlan["outputs"][number]["artifactRef"]>,
) =>
  Boolean(
    left &&
    ("source" in left
      ? "source" in right
      : "producerId" in right &&
        left.producerId === right.producerId &&
        left.outputId === right.outputId),
  );

const preferredBuild = (
  registry: ReleaseRegistry,
  type: string,
  id: string,
  preference: { engine?: string; targets?: string[] },
): ReleaseBuildProfileConfig | undefined => {
  if (!preference.engine) return undefined;
  const producer = registry.producers.find(
    (candidate) => candidate.id === preference.engine && candidate.planning.mode === "build",
  );
  if (!producer) return undefined;
  const targets = producer.targets.filter((target) => target.buildType === type);
  if (!targets.length) return undefined;
  const enabledTargets = preference.targets?.length ? preference.targets : [targets[0].id];
  return {
    id,
    type,
    engine: producer.id,
    enabled: true,
    config: producer.createDefaultConfig(),
    targets: targets.map((target) => ({
      id: target.id,
      enabled: enabledTargets.includes(target.id),
      config: target.createDefaultConfig(),
    })),
  };
};

const hasBlockingIssue = (plan: ReleasePlan, paths: string[]) =>
  plan.issues.some((issue) => {
    const issuePath = issue.path;
    return (
      issue.severity === "error" &&
      issuePath !== undefined &&
      paths.some((path) => issuePath === path || issuePath.startsWith(`${path}.`))
    );
  });

const plannerAcceptsOutput = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleasePlanningContext,
  destinationIndex: number,
  slotIndex: number,
  ref: ReleaseOutputRef,
  artifactRef: ReleasePlan["outputs"][number]["artifactRef"],
) => {
  const candidate = cloneConfig(config);
  candidate.destinations[destinationIndex].slots[slotIndex].input = ref;
  const plan = planRelease(candidate, registry, context);
  const path = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
  return (
    !hasBlockingIssue(plan, [path]) &&
    artifactRefEquals(plan.destinations[destinationIndex]?.slots[slotIndex]?.input, artifactRef)
  );
};

export const resolveReleaseDefaults = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleasePlanningContext,
  preferences: ReleaseBuildPreferences = getReleaseBuildPreferences(),
): ReleaseConfig => {
  const resolved = cloneConfig(config);
  const buildTypes = [
    ...new Set([
      ...Object.keys(preferences.buildTypes),
      ...Object.keys(DEFAULT_RELEASE_BUILD_PREFERENCES.buildTypes),
    ]),
  ];

  for (const [destinationIndex, destination] of resolved.destinations.entries()) {
    if (!destination.enabled) continue;
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled || slot.input) continue;
      const path = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
      const currentPlan = planRelease(resolved, registry, context);
      if (
        !currentPlan.issues.some(
          (issue) => issue.code === "release.destination.input.required" && issue.path === path,
        )
      )
        continue;

      const existing = currentPlan.outputs.find((output) =>
        plannerAcceptsOutput(
          resolved,
          registry,
          context,
          destinationIndex,
          slotIndex,
          output.ref,
          output.artifactRef,
        ),
      );
      if (existing) {
        slot.input = existing.ref;
        continue;
      }

      for (const buildType of buildTypes) {
        for (const preference of [
          preferences.buildTypes[buildType],
          DEFAULT_RELEASE_BUILD_PREFERENCES.buildTypes[buildType],
        ]) {
          const build = preference
            ? preferredBuild(registry, buildType, nanoid(), preference)
            : undefined;
          if (!build) continue;
          const buildIndex = resolved.builds.length;
          resolved.builds.push(build);
          const target = build.targets.find((candidate) => candidate.enabled);
          const outputRef = target ? { buildId: build.id, targetId: target.id } : undefined;
          const candidateAccepted =
            target &&
            outputRef &&
            plannerAcceptsOutput(
              resolved,
              registry,
              context,
              destinationIndex,
              slotIndex,
              outputRef,
              { producerId: build.id, outputId: target.id },
            );
          if (candidateAccepted) {
            slot.input = outputRef;
            if (
              !hasBlockingIssue(planRelease(resolved, registry, context), [
                `builds.${buildIndex}`,
                path,
              ])
            )
              break;
            slot.input = undefined;
          }
          resolved.builds.pop();
        }
        if (slot.input) break;
      }
    }
  }
  return resolved;
};
