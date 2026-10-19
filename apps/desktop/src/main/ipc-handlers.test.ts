import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { showExistingItemInFolder } from "./show-existing-item";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("showExistingItemInFolder", () => {
  it("shows an existing artifact in the file manager", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipelab-artifact-"));
    tempDirs.push(dir);
    const artifact = join(dir, "release.zip");
    await writeFile(artifact, "artifact");
    const shown: string[] = [];

    await showExistingItemInFolder(artifact, (path) => shown.push(path));
    assert.deepEqual(shown, [artifact]);
  });

  it("returns a useful error instead of silently ignoring a deleted artifact", async () => {
    const artifact = join(tmpdir(), `pipelab-deleted-${Date.now()}.zip`);
    const shown: string[] = [];

    await assert.rejects(
      showExistingItemInFolder(artifact, (path) => shown.push(path)),
      new Error(`Artifact is missing or unavailable: ${artifact}`),
    );
    assert.deepEqual(shown, []);
  });
});
