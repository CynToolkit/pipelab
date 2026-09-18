import { expect, test } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePlaywrightProfile } from "../../src/export-shared";

test("preserves selected-profile addon and login data while omitting stale browser state", async () => {
  const root = await mkdtemp(join(tmpdir(), "construct-profile-copy-"));
  const source = join(root, "PipelabConstruct", "Default");
  const destination = join(root, "playwright-profile");
  const addonDatabase = join(
    source,
    "IndexedDB",
    "https_editor.construct.net_0.indexeddb.leveldb",
    "000003.log",
  );
  const localStorage = join(source, "Local Storage", "leveldb", "000003.log");
  const extensionManifest = join(source, "Extensions", "construct-addon", "1.0", "manifest.json");
  const cacheFile = join(source, "Cache", "cached-response");
  const serviceWorkerCache = join(source, "Service Worker", "CacheStorage", "cached-script");
  const sessionFile = join(source, "Sessions", "Session_1");
  const currentSessionFile = join(source, "Current Session");

  try {
    for (const path of [
      addonDatabase,
      localStorage,
      extensionManifest,
      cacheFile,
      serviceWorkerCache,
      sessionFile,
    ]) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "profile-data");
    }
    await writeFile(join(source, "Preferences"), "selected profile preferences");
    await writeFile(currentSessionFile, "stale session");

    await preparePlaywrightProfile(source, destination);

    const copiedProfile = join(destination, "Default");
    await expect(readFile(join(copiedProfile, "Preferences"), "utf8")).resolves.toBe(
      "selected profile preferences",
    );
    await expect(
      readFile(
        join(
          copiedProfile,
          "IndexedDB",
          "https_editor.construct.net_0.indexeddb.leveldb",
          "000003.log",
        ),
        "utf8",
      ),
    ).resolves.toBe("profile-data");
    await expect(
      readFile(join(copiedProfile, "Local Storage", "leveldb", "000003.log"), "utf8"),
    ).resolves.toBe("profile-data");
    await expect(
      readFile(
        join(copiedProfile, "Extensions", "construct-addon", "1.0", "manifest.json"),
        "utf8",
      ),
    ).resolves.toBe("profile-data");

    for (const transientFile of [cacheFile, serviceWorkerCache, sessionFile, currentSessionFile]) {
      await expect(
        access(join(copiedProfile, transientFile.slice(source.length + 1))),
      ).rejects.toThrow();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
