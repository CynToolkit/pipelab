import AdmZip from "adm-zip";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatSavedConstructVersion, getSavedConstructVersion } from "./saved-version";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pipelab-c3p-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const writeProject = async (name: string, entries: Record<string, string>) => {
  const archive = new AdmZip();
  for (const [entry, content] of Object.entries(entries))
    archive.addFile(entry, Buffer.from(content));
  const file = join(directory, name);
  await writeFile(file, archive.toBuffer());
  return file;
};

describe("saved Construct version", () => {
  it("decodes release and patch from savedWithRelease", () => {
    expect(formatSavedConstructVersion(46602)).toBe("r466-2");
    expect(formatSavedConstructVersion(50600)).toBe("r506");
    expect(formatSavedConstructVersion(0)).toBeUndefined();
    expect(formatSavedConstructVersion("46602")).toBeUndefined();
    expect(formatSavedConstructVersion(466.5)).toBeUndefined();
  });

  it("reads the release a project was saved with from project.c3proj", async () => {
    const file = await writeProject("game.c3p", {
      "project.c3proj": JSON.stringify({ name: "Game", savedWithRelease: 46602 }),
    });

    await expect(getSavedConstructVersion(file)).resolves.toBe("r466-2");
  });

  it("returns undefined for missing, malformed or unrelated archives", async () => {
    const noProject = await writeProject("empty.c3p", { "readme.txt": "hi" });
    const noRelease = await writeProject("old.c3p", {
      "project.c3proj": JSON.stringify({ name: "Old" }),
    });
    const malformed = await writeProject("bad.c3p", { "project.c3proj": "{not json" });

    await expect(getSavedConstructVersion(noProject)).resolves.toBeUndefined();
    await expect(getSavedConstructVersion(noRelease)).resolves.toBeUndefined();
    await expect(getSavedConstructVersion(malformed)).resolves.toBeUndefined();
    await expect(getSavedConstructVersion(join(directory, "missing.c3p"))).resolves.toBeUndefined();
  });
});
