const websiteOnlyInfrastructureFiles = new Set([
  "pnpm-lock.yaml",
  ".github/workflows/pipeline.yml",
  ".github/workflows/delivery.yml",
  "scripts/detect-changes.ts",
  "scripts/detect-changes-logic.mjs",
  "scripts/detect-changes-logic.test.mjs",
]);

// These are workspace packages in the dependency closure of @pipelab/app.
// Keep unrelated workspace packages (for example @pipelab/cloud-azure) out of
// desktop delivery classification.
const desktopBuildPackagePrefixes = [
  "apps/desktop/",
  "assets/",
  "packages/constants/",
  "packages/core-node/",
  "packages/migration/",
  "packages/shared/",
  "packages/tsconfig/",
  "packages/workflow-runtime/",
  "plugins/",
];

const desktopBuildConfigFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

const windowsSmokePrefixes = ["apps/desktop/", "plugins/plugin-electron/", "plugins/plugin-steam/"];

const macosSmokePrefixes = ["apps/desktop/", "assets/asset-electron/", "plugins/plugin-electron/"];

function isWebsiteOnlyChange(changedFiles) {
  return (
    changedFiles.some((path) => path.startsWith("apps/website/")) &&
    changedFiles.every(
      (path) => path.startsWith("apps/website/") || websiteOnlyInfrastructureFiles.has(path),
    )
  );
}

function hasPrefix(changedFiles, prefixes) {
  return changedFiles.some((path) => prefixes.some((prefix) => path.startsWith(prefix)));
}

export function affectedPackagesForChanges(turboAffectedPackages, changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return ["@pipelab/website"];
  return turboAffectedPackages;
}

export function needsDesktopBuild(changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return false;

  return (
    hasPrefix(changedFiles, desktopBuildPackagePrefixes) ||
    changedFiles.some((path) => desktopBuildConfigFiles.has(path))
  );
}

export function needsWindowsSmoke(changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return false;

  return (
    hasPrefix(changedFiles, windowsSmokePrefixes) ||
    changedFiles.some((path) => /^packages\/core-node\/src\/fs-utils(?:\.[^/]*)?$/.test(path))
  );
}

export function needsMacosSmoke(changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return false;
  return hasPrefix(changedFiles, macosSmokePrefixes);
}

export function hasDesktopRelatedChanges(changedFiles) {
  return needsDesktopBuild(changedFiles);
}

export function desktopVersionChanged(changedFiles, baseVersion, currentVersion) {
  return (
    !isWebsiteOnlyChange(changedFiles) &&
    changedFiles.includes("apps/desktop/package.json") &&
    typeof baseVersion === "string" &&
    typeof currentVersion === "string" &&
    baseVersion !== currentVersion
  );
}
