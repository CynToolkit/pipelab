import { expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preparePlaywrightProfile } from "./export-shared";
import { fetchPackage, type ProviderHostContext } from "@pipelab/plugin-core";
import dns from "node:dns/promises";

test("copies the complete Construct profile and removes stale browser locks", async () => {
  const root = await mkdtemp(join("/tmp", "construct-profile-copy-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  const database = join(source, "IndexedDB", "https_editor.construct.net_0.indexeddb.leveldb");
  await mkdir(database, { recursive: true });
  await writeFile(join(source, "Preferences"), "profile metadata");
  await writeFile(join(database, "addon-record"), "pipelab");
  await writeFile(join(database, "LOCK"), "");

  try {
    await preparePlaywrightProfile(source, destination);

    expect(await readFile(join(destination, "Default", "Preferences"), "utf8")).toBe(
      "profile metadata",
    );
    expect(
      await readFile(
        join(
          destination,
          "Default",
          "IndexedDB",
          "https_editor.construct.net_0.indexeddb.leveldb",
          "addon-record",
        ),
        "utf8",
      ),
    ).toBe("pipelab");
    await expect(
      rm(
        join(
          destination,
          "Default",
          "IndexedDB",
          "https_editor.construct.net_0.indexeddb.leveldb",
          "LOCK",
        ),
      ),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses an installed exact Playwright package without resolving npm metadata", async () => {
  const root = await mkdtemp(join("/tmp", "construct-package-cache-"));
  const packageName = "playwright-core";
  const packageDir = join(root, "packages", packageName, "1.62.1");
  const dnsLookup = vi
    .spyOn(dns, "lookup")
    .mockRejectedValue(new Error("network should not be used"));
  const context: ProviderHostContext = {
    releaseTag: "latest",
    getPackagesPath: (...segments) => join(root, "packages", ...segments),
    getThirdPartyPath: (...segments) => join(root, "third-party", ...segments),
    getTempPath: (...segments) => join(root, "temp", ...segments),
    createTempFolder: async (prefix = "temp-") => {
      const path = join(root, "temp", prefix);
      await mkdir(path, { recursive: true });
      return path;
    },
    getCachePath: (folder = "pacote", ...segments) => join(root, "cache", folder, ...segments),
    getPnpmPath: (...segments) => join(root, "pnpm", ...segments),
    getNodePath: (version = "") => join(root, "node", version),
    getConnectionsPath: () => join(root, "connections"),
    ensureNodeJS: async () => process.execPath,
    ensurePNPM: async () => "pnpm",
    resolveBundledAsset: async (name) => name,
  };

  try {
    await mkdir(join(packageDir, "node_modules", "installed-dependency"), { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ name: packageName, version: "1.62.1" }),
    );

    const result = await fetchPackage(packageName, "1.62.1", { context, installDeps: true });

    expect(result.packageDir).toBe(packageDir);
    expect(result.resolvedVersion).toBe("1.62.1");
    expect(dnsLookup).not.toHaveBeenCalled();
  } finally {
    dnsLookup.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});

test("copies only the exact Chromium profile directory selected by the user", async () => {
  const root = await mkdtemp(join("/tmp", "construct-user-data-copy-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await mkdir(join(source, "Default", "IndexedDB"), { recursive: true });
  await mkdir(join(source, "IndexedDB"), { recursive: true });
  await writeFile(join(source, "Local State"), "{}");
  await writeFile(join(source, "Preferences"), "stale root profile");
  await writeFile(join(source, "IndexedDB", "stale-addon-marker"), "stale");
  await writeFile(join(source, "Default", "Preferences"), "active profile");
  await writeFile(join(source, "Default", "IndexedDB", "installed-addon-marker"), "pipelabv2");

  try {
    await preparePlaywrightProfile(source, destination);

    await expect(
      readFile(join(destination, "Default", "IndexedDB", "stale-addon-marker"), "utf8"),
    ).resolves.toBe("stale");
    await expect(
      readFile(
        join(destination, "Default", "Default", "IndexedDB", "installed-addon-marker"),
        "utf8",
      ),
    ).resolves.toBe("pipelabv2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
