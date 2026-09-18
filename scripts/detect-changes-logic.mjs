const websiteOnlyInfrastructureFiles = new Set([
  'pnpm-lock.yaml',
  '.github/workflows/pipeline.yml',
  'scripts/detect-changes.ts',
  'scripts/detect-changes-logic.mjs',
  'scripts/detect-changes-logic.test.mjs',
])

const desktopPackagePrefixes = [
  'apps/cli/',
  'apps/desktop/',
  'apps/ui/',
  'assets/',
  'packages/',
  'plugins/',
]

const desktopConfigFiles = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
])

function isWebsiteOnlyChange(changedFiles) {
  return (
    changedFiles.some((path) => path.startsWith('apps/website/')) &&
    changedFiles.every(
      (path) => path.startsWith('apps/website/') || websiteOnlyInfrastructureFiles.has(path),
    )
  )
}

export function affectedPackagesForChanges(turboAffectedPackages, changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return ['@pipelab/website']
  return turboAffectedPackages
}

export function hasDesktopRelatedChanges(changedFiles) {
  if (isWebsiteOnlyChange(changedFiles)) return false

  return (
    changedFiles.some(
      (path) =>
        desktopPackagePrefixes.some((prefix) => path.startsWith(prefix)) ||
        desktopConfigFiles.has(path) ||
        (path.startsWith('scripts/') && path !== 'scripts/detect-changes.ts' && !path.startsWith('scripts/detect-changes-logic.')),
    ) ||
    (changedFiles.includes('pnpm-lock.yaml') && !changedFiles.some((path) => path.startsWith('apps/website/')))
  )
}
