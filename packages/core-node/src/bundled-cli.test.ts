import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveBundledAsset, resolveBundledCli, resolveBundledUiFolder } from "./bundled-cli";

describe("resolveBundledCli", () => {
  test("resolves the UI beside the CLI entrypoint", () => {
    expect(resolveBundledUiFolder("/resources/cli")).toBe(
      join("/resources/cli", "ui"),
    );
  });

  test("resolves the extracted CLI from its generated manifest", async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), "pipelab-cli-"));
    const cliPath = join(resourcesPath, "cli");
    await mkdir(cliPath, { recursive: true });
    await writeFile(
      join(cliPath, "package.json"),
      JSON.stringify({ bin: { pipelab: "index.mjs" } }),
    );
    await writeFile(join(cliPath, "index.mjs"), "");

    await expect(resolveBundledCli(resourcesPath)).resolves.toEqual({
      packageDir: cliPath,
      entryPoint: join(cliPath, "index.mjs"),
      isLocal: false,
    });
  });

  test("ignores a manifest whose configured entrypoint is missing", async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), "pipelab-cli-"));
    const cliPath = join(resourcesPath, "app", "dist", "cli");
    await mkdir(cliPath, { recursive: true });
    await writeFile(join(cliPath, "package.json"), JSON.stringify({ main: "missing.mjs" }));

    await expect(resolveBundledCli(resourcesPath)).resolves.toBeNull();
  });

  test("resolves the CLI from the unpacked desktop app", async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), "pipelab-cli-"));
    const cliPath = join(resourcesPath, "app", "dist", "cli");
    await mkdir(cliPath, { recursive: true });
    await writeFile(join(cliPath, "package.json"), JSON.stringify({ main: "index.mjs" }));
    await writeFile(join(cliPath, "index.mjs"), "");

    await expect(resolveBundledCli(resourcesPath)).resolves.toEqual({
      packageDir: cliPath,
      entryPoint: join(cliPath, "index.mjs"),
      isLocal: false,
    });
  });

  test("prefers the unpacked desktop app over the legacy resource location", async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), "pipelab-cli-"));
    const legacyCliPath = join(resourcesPath, "cli");
    const packagedCliPath = join(resourcesPath, "app", "dist", "cli");

    await mkdir(legacyCliPath, { recursive: true });
    await writeFile(join(legacyCliPath, "package.json"), JSON.stringify({ main: "index.mjs" }));
    await writeFile(join(legacyCliPath, "index.mjs"), "");

    await mkdir(packagedCliPath, { recursive: true });
    await writeFile(join(packagedCliPath, "package.json"), JSON.stringify({ main: "index.mjs" }));
    await writeFile(join(packagedCliPath, "index.mjs"), "");

    await expect(resolveBundledCli(resourcesPath)).resolves.toMatchObject({
      packageDir: packagedCliPath,
    });
  });

  test("resolves an asset template from the CLI distribution", async () => {
    const cliDir = await mkdtemp(join(tmpdir(), "pipelab-cli-"));
    const assetDir = join(cliDir, "assets", "asset-discord");
    await mkdir(assetDir, { recursive: true });
    await writeFile(
      join(assetDir, "package.json"),
      JSON.stringify({ name: "@pipelab/asset-discord" }),
    );

    expect(resolveBundledAsset("@pipelab/asset-discord", cliDir)).toBe(assetDir);
  });

  test("rejects asset packages that are not staged in the CLI", async () => {
    const cliDir = await mkdtemp(join(tmpdir(), "pipelab-cli-"));

    expect(() => resolveBundledAsset("@pipelab/asset-tauri", cliDir)).toThrow(
      "Bundled asset @pipelab/asset-tauri was not found",
    );
  });
});
