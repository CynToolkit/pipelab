import type { ReleaseBuildProfileConfig } from "@pipelab/shared";

export const persistBuildChangesBeforeNavigation = async (
  hasUnsavedChanges: () => boolean,
  cancelPendingSave: () => void,
  save: () => Promise<void>,
) => {
  cancelPendingSave();
  try {
    while (hasUnsavedChanges()) await save();
    return true;
  } catch {
    return false;
  }
};

export type WorkflowSaveState = "saving" | "saved" | "error";

export const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null)
    return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        structurallyEqual(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
};

export const hasUnsavedReleaseWorkflowState = ({
  changeRevision,
  persistedRevision,
  saveState,
  buildSettingsOpen = false,
  draftBuild,
  currentBuild,
}: {
  changeRevision: number;
  persistedRevision: number;
  saveState: WorkflowSaveState;
  buildSettingsOpen?: boolean;
  draftBuild?: ReleaseBuildProfileConfig;
  currentBuild?: ReleaseBuildProfileConfig;
}) =>
  changeRevision !== persistedRevision ||
  saveState === "saving" ||
  saveState === "error" ||
  (buildSettingsOpen && Boolean(draftBuild) && !structurallyEqual(draftBuild, currentBuild));

export const preventBeforeUnloadIfUnsaved = (
  event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">,
  hasUnsavedState: boolean,
) => {
  if (!hasUnsavedState) return false;
  event.preventDefault();
  event.returnValue = "";
  return true;
};

export const resolveUnappliedBuildNavigation = async (
  hasStagedChanges: boolean,
  confirmDiscard: () => Promise<boolean>,
  discard: () => void,
) => {
  if (!hasStagedChanges) return true;
  if (!(await confirmDiscard())) return false;
  discard();
  return true;
};

export const producerInspectionResponseIsCurrent = (
  requestId: number,
  currentRequestId: number,
  settingsVisible: boolean,
  inspectedBuildId: string,
  draftBuildId: string | undefined,
) =>
  requestId === currentRequestId &&
  settingsVisible &&
  Boolean(draftBuildId) &&
  inspectedBuildId === draftBuildId;

export const buildInspectionSignature = (build: ReleaseBuildProfileConfig | undefined) =>
  build
    ? JSON.stringify({ engine: build.engine, config: build.config, targets: build.targets })
    : "";

export const resolveBuildIssueRequest = (
  builds: ReleaseBuildProfileConfig[],
  buildId: string,
  issuePath: string,
) => {
  if (buildId) return builds.find((build) => build.id === buildId);
  const match = issuePath.match(/^builds\.(\d+)/);
  return match ? builds[Number(match[1])] : undefined;
};

export const buildIssueControlId = (
  build: ReleaseBuildProfileConfig,
  buildIndex: number,
  issuePath: string,
) => {
  const prefix = `builds.${buildIndex}.`;
  if (!issuePath.startsWith(prefix)) return undefined;
  const path = issuePath.slice(prefix.length);

  if (path === "engine") return `settings-engine-${build.id}`;
  if (path === "input" || path.startsWith("input.")) return `settings-input-${build.id}`;
  if (path.startsWith("config.")) return `build-${build.id}-${path.slice("config.".length)}`;

  const targetMatch = path.match(/^targets\.(\d+)(?:\.(.*))?$/);
  if (!targetMatch) return undefined;
  const target = build.targets[Number(targetMatch[1])];
  if (!target) return undefined;
  const targetPath = targetMatch[2] || "";
  if (targetPath.startsWith("config."))
    return `target-${build.id}-${target.id}-${targetPath.slice("config.".length)}`;
  return `build-target-${build.id}-${target.id}`;
};
