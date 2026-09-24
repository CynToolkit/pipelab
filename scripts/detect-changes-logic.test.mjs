import assert from "node:assert/strict";
import test from "node:test";

import {
  affectedPackagesForChanges,
  desktopVersionChanged,
  hasDesktopRelatedChanges,
  needsDesktopBuild,
  needsMacosSmoke,
  needsWindowsSmoke,
} from "./detect-changes-logic.mjs";

test("website-only source and lockfile changes affect only the website", () => {
  const changedFiles = [
    "apps/website/package.json",
    "apps/website/src/main.ts",
    "pnpm-lock.yaml",
    ".github/workflows/pipeline.yml",
    ".github/workflows/delivery.yml",
    "scripts/detect-changes.ts",
    "scripts/detect-changes-logic.mjs",
    "scripts/detect-changes-logic.test.mjs",
  ];

  assert.deepEqual(affectedPackagesForChanges(["@pipelab/app", "@pipelab/website"], changedFiles), [
    "@pipelab/website",
  ]);
  assert.equal(hasDesktopRelatedChanges(changedFiles), false);
  assert.equal(needsDesktopBuild(changedFiles), false);
  assert.equal(needsWindowsSmoke(changedFiles), false);
  assert.equal(needsMacosSmoke(changedFiles), false);
});

test("desktop bundle source changes remain desktop-relevant", () => {
  const changedFiles = ["plugins/plugin-core/src/index.ts"];

  assert.deepEqual(
    affectedPackagesForChanges(["@pipelab/app", "@pipelab/plugin-core"], changedFiles),
    ["@pipelab/app", "@pipelab/plugin-core"],
  );
  assert.equal(hasDesktopRelatedChanges(changedFiles), true);
  assert.equal(needsDesktopBuild(changedFiles), true);
  assert.equal(needsWindowsSmoke(changedFiles), false);
  assert.equal(needsMacosSmoke(changedFiles), false);
});

test("lockfile-only dependency updates remain conservatively desktop-relevant", () => {
  assert.equal(hasDesktopRelatedChanges(["pnpm-lock.yaml"]), true);
  assert.equal(needsDesktopBuild(["pnpm-lock.yaml"]), true);
  assert.equal(needsWindowsSmoke(["pnpm-lock.yaml"]), false);
  assert.equal(needsMacosSmoke(["pnpm-lock.yaml"]), false);
});

test("desktop build classification follows the desktop dependency closure", () => {
  for (const path of [
    "apps/desktop/src/main.ts",
    "assets/asset-electron/src/index.ts",
    "packages/core-node/src/index.ts",
    "packages/migration/src/index.ts",
    "packages/workflow-runtime/src/index.ts",
    "plugins/plugin-godot/src/index.ts",
    "pnpm-workspace.yaml",
    "turbo.json",
  ]) {
    assert.equal(needsDesktopBuild([path]), true, `${path} should require desktop build`);
  }

  for (const path of [
    "apps/cli/src/index.ts",
    "apps/ui/src/main.ts",
    "packages/cloud-azure/src/index.ts",
    "packages/test-utils/src/index.ts",
    "packages/cloud/src/index.ts",
  ]) {
    assert.equal(needsDesktopBuild([path]), false, `${path} should not require desktop build`);
  }
});

test("Windows smoke covers Windows-sensitive filesystem and host integrations only", () => {
  for (const path of [
    "packages/core-node/src/fs-utils.test.ts",
    "packages/core-node/src/fs-utils.ts",
    "plugins/plugin-steam/src/index.ts",
    "plugins/plugin-electron/src/index.ts",
    "apps/desktop/src/main.ts",
  ]) {
    assert.equal(needsWindowsSmoke([path]), true, `${path} should require Windows smoke`);
  }

  for (const path of [
    "packages/core-node/src/index.ts",
    "plugins/plugin-godot/src/index.ts",
    "apps/cli/src/index.ts",
    "pnpm-lock.yaml",
  ]) {
    assert.equal(needsWindowsSmoke([path]), false, `${path} should not require Windows smoke`);
  }
});

test("macOS smoke covers Electron and desktop packaging inputs only", () => {
  for (const path of [
    "apps/desktop/forge.config.ts",
    "plugins/plugin-electron/src/index.ts",
    "assets/asset-electron/src/index.ts",
  ]) {
    assert.equal(needsMacosSmoke([path]), true, `${path} should require macOS smoke`);
  }

  for (const path of [
    "packages/core-node/src/index.ts",
    "plugins/plugin-steam/src/index.ts",
    "assets/asset-discord/src/index.ts",
    "pnpm-lock.yaml",
  ]) {
    assert.equal(needsMacosSmoke([path]), false, `${path} should not require macOS smoke`);
  }
});

test("desktop version changes require an explicit package version difference", () => {
  assert.equal(
    desktopVersionChanged(["apps/desktop/package.json"], "2.0.0-beta.33", "2.0.0-beta.34"),
    true,
  );
  assert.equal(
    desktopVersionChanged(["apps/desktop/package.json"], "2.0.0-beta.33", "2.0.0-beta.33"),
    false,
  );
  assert.equal(
    desktopVersionChanged(["apps/desktop/src/main.ts"], "2.0.0-beta.33", "2.0.0-beta.34"),
    false,
  );
  assert.equal(
    desktopVersionChanged(["apps/desktop/package.json"], undefined, "2.0.0-beta.34"),
    false,
  );
});
