import AdmZip from "adm-zip";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePinnedPipelabAddon,
  getPipelabAddonRequirement,
  PIPELAB_ADDON,
} from "./addon-preparation.js";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "construct-addon-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

const createProject = async (usedAddons: unknown[]) => {
  const directory = await createTemporaryDirectory();
  const path = join(directory, "project.c3p");
  const archive = new AdmZip();
  archive.addFile("project.c3proj", Buffer.from(JSON.stringify({ usedAddons })));
  archive.writeZip(path);
  return path;
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Construct addon preparation", () => {
  it("detects the exact referenced Pipelab addon version", async () => {
    const project = await createProject([
      { id: "Sprite", version: null, sdkVersion: null, bundled: false },
      {
        id: PIPELAB_ADDON.id,
        version: PIPELAB_ADDON.version,
        sdkVersion: PIPELAB_ADDON.sdkVersion,
        bundled: false,
      },
    ]);

    await expect(getPipelabAddonRequirement(project)).resolves.toEqual({
      version: PIPELAB_ADDON.version,
      sdkVersion: PIPELAB_ADDON.sdkVersion,
    });
  });

  it("preserves profile-based behavior for a different Pipelab addon version", async () => {
    const project = await createProject([
      { id: PIPELAB_ADDON.id, version: "2.6.0", sdkVersion: 2, bundled: false },
    ]);

    await expect(getPipelabAddonRequirement(project)).resolves.toBeUndefined();
  });

  it("does not require an addon when the project does not reference Pipelab", async () => {
    const project = await createProject([{ id: "Sprite", bundled: false }]);
    await expect(getPipelabAddonRequirement(project)).resolves.toBeUndefined();
  });

  it("rejects an asset whose bytes do not match the pinned release digest", async () => {
    const directory = await createTemporaryDirectory();
    const abortController = new AbortController();
    const fetchAsset = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not the signed release asset", { status: 200 }));

    await expect(
      ensurePinnedPipelabAddon(directory, abortController.signal, fetchAsset),
    ).rejects.toThrow("pinned SHA-256");
    expect(fetchAsset).toHaveBeenCalledWith(PIPELAB_ADDON.url, {
      signal: abortController.signal,
    });
    await expect(
      stat(join(directory, `pipelabv2-${PIPELAB_ADDON.version}-sdk-v2.c3addon`)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discards a corrupt cached artifact and rejects a corrupt replacement", async () => {
    const directory = await createTemporaryDirectory();
    const cached = join(directory, `pipelabv2-${PIPELAB_ADDON.version}-sdk-v2.c3addon`);
    await writeFile(cached, "stale cache entry");
    const fetchAsset = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad replacement", { status: 200 }));

    await expect(
      ensurePinnedPipelabAddon(directory, new AbortController().signal, fetchAsset),
    ).rejects.toThrow("pinned SHA-256");
    await expect(readFile(cached)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
