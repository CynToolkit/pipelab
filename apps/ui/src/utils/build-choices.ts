import type { ReleaseConfig } from "@pipelab/shared";
import type { CompatibleBuildCandidate } from "../pages/release-flow-model";

export type BuildPlatform = "windows" | "macos" | "linux" | "other";

export interface BuildChoiceFilters {
  query: string;
  engine: string;
  platform: BuildPlatform | "";
}

export interface BuildChoiceGroup {
  engine: string;
  engineLabel: string;
  choices: CompatibleBuildCandidate[];
}

/** Target ids look like `windows-x64` or `macos-arm64`; the prefix names the operating system. */
export const buildChoicePlatform = (choice: CompatibleBuildCandidate): BuildPlatform => {
  const target = choice.target.toLowerCase();
  if (target.startsWith("win")) return "windows";
  if (target.startsWith("mac") || target.startsWith("darwin") || target.startsWith("osx"))
    return "macos";
  if (target.startsWith("linux")) return "linux";
  return "other";
};

export const buildPlatformLabel = (platform: BuildPlatform) =>
  ({ windows: "Windows", macos: "macOS", linux: "Linux", other: "Other" })[platform];

export const buildPlatformIcon = (platform: BuildPlatform) =>
  ({
    windows: "mdi mdi-microsoft-windows",
    macos: "mdi mdi-apple",
    linux: "mdi mdi-linux",
    other: "mdi mdi-cube-outline",
  })[platform];

/** Every search word must appear somewhere in the engine, type or target name. */
export const filterBuildChoices = (
  choices: CompatibleBuildCandidate[],
  filters: BuildChoiceFilters,
): CompatibleBuildCandidate[] => {
  const words = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  return choices.filter((choice) => {
    if (filters.engine && choice.engine !== filters.engine) return false;
    if (filters.platform && buildChoicePlatform(choice) !== filters.platform) return false;
    if (!words.length) return true;
    const haystack =
      `${choice.engineLabel} ${choice.typeLabel} ${choice.targetLabel} ${choice.target}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};

/** Groups by engine, keeping the order in which engines first appear. */
export const groupBuildChoices = (choices: CompatibleBuildCandidate[]): BuildChoiceGroup[] => {
  const groups = new Map<string, BuildChoiceGroup>();
  for (const choice of choices) {
    const key = `${choice.type}:${choice.engine}`;
    const group = groups.get(key) ?? {
      engine: choice.engine,
      engineLabel: choice.engineLabel,
      choices: [],
    };
    group.choices.push(choice);
    groups.set(key, group);
  }
  return [...groups.values()];
};

/** True when the workflow already has an enabled build for this exact engine, type and target. */
export const buildChoiceAlreadyAdded = (
  flow: ReleaseConfig | undefined,
  choice: CompatibleBuildCandidate,
) =>
  Boolean(
    flow?.builds.some(
      (build) =>
        build.enabled &&
        build.engine === choice.engine &&
        build.type === choice.type &&
        build.targets.some((target) => target.enabled && target.id === choice.target),
    ),
  );
