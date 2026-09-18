import assert from 'node:assert/strict'
import test from 'node:test'

import { affectedPackagesForChanges, hasDesktopRelatedChanges } from './detect-changes-logic.mjs'

test('website-only source and lockfile changes affect only the website', () => {
  const changedFiles = [
    'apps/website/package.json',
    'apps/website/src/main.ts',
    'pnpm-lock.yaml',
    '.github/workflows/pipeline.yml',
    'scripts/detect-changes.ts',
    'scripts/detect-changes-logic.mjs',
    'scripts/detect-changes-logic.test.mjs',
  ]

  assert.deepEqual(
    affectedPackagesForChanges(['@pipelab/app', '@pipelab/website'], changedFiles),
    ['@pipelab/website'],
  )
  assert.equal(hasDesktopRelatedChanges(changedFiles), false)
})

test('desktop bundle source changes remain desktop-relevant', () => {
  const changedFiles = ['plugins/plugin-core/src/index.ts']

  assert.deepEqual(
    affectedPackagesForChanges(['@pipelab/app', '@pipelab/plugin-core'], changedFiles),
    ['@pipelab/app', '@pipelab/plugin-core'],
  )
  assert.equal(hasDesktopRelatedChanges(changedFiles), true)
})

test('lockfile-only dependency updates remain conservatively desktop-relevant', () => {
  assert.equal(hasDesktopRelatedChanges(['pnpm-lock.yaml']), true)
})
