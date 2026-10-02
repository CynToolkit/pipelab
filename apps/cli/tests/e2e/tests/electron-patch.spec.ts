import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runAction } from "@pipelab/test-utils";
import { runWithLiveLogs, resolveBundledAsset } from "@pipelab/plugin-core";
import { configureParams } from "../../../../../plugins/plugin-electron/src/forge";
import { packageV2Runner } from "../../../../../plugins/plugin-electron/src/package-v2";
import { packageRunner } from "../../../../../plugins/plugin-electron/src/package";
import { makeRunner } from "../../../../../plugins/plugin-electron/src/make";
import { defaultElectronConfig } from "../../../../../plugins/plugin-electron/src/utils";
import { patchExecutableWithGpupatch } from "../../../../../plugins/plugin-electron/src/gpupatch";

vi.mock("@pipelab/plugin-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pipelab/plugin-core")>()),
  detectRuntime: vi.fn(),
  runPnpm: vi.fn().mockResolvedValue({ all: "" }),
  runWithLiveLogs: vi.fn(),
  resolveBundledAsset: vi.fn(),
}));
vi.mock("../../../../../plugins/plugin-electron/src/gpupatch", () => ({
  patchExecutableWithGpupatch: vi.fn(),
}));

let sandbox: Awaited<ReturnType<typeof createSandbox>>;
beforeEach(async () => {
  vi.clearAllMocks();
  sandbox = await createSandbox("electron-patch");
  const assetFolder = join(sandbox.path, "asset-electron");
  await mkdir(join(assetFolder, "template", "src"), { recursive: true });
  await writeFile(
    join(assetFolder, "template", "package.json"),
    JSON.stringify({ name: "template" }),
  );
  vi.mocked(resolveBundledAsset).mockResolvedValue(assetFolder);
  vi.mocked(runWithLiveLogs).mockImplementation(async (_command, args, options) => {
    const target = args[args.indexOf("--platform") + 1];
    const output = args.includes("make")
      ? join(String(options.cwd), "out", "make")
      : join(String(options.cwd), "out", `My Game-${target}-x64`);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, target === "win32" ? "My Game.exe" : "My Game"), "original");
  });
  vi.mocked(patchExecutableWithGpupatch).mockImplementation(async (binary, platform) => {
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
    if (platform === "win32") await writeFile(binary, "patched");
  });
});
afterEach(async () => {
  await sandbox.remove();
});

describe("Electron patch option in the CLI host", () => {
  it("exposes an opt-in checkbox restricted to Windows", () => {
    expect(defaultElectronConfig.patchExecutable).toBe(false);
    expect(configureParams.patchExecutable).toMatchObject({
      label: "Patch executable",
      platforms: ["win32"],
      value: false,
    });
  });
  it("patches the staged Windows target and publishes the patched copy", async () => {
    const result = await runAction(packageV2Runner, {
      sandboxPath: sandbox.path,
      inputs: {
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
        patchExecutable: true,
      },
    });
    expect(patchExecutableWithGpupatch).toHaveBeenCalledWith(
      expect.stringMatching(/My Game-win32-x64[/\\]My Game\.exe$/),
      "win32",
      expect.objectContaining({ context: expect.any(Object) }),
    );
    expect(result.outputs.output).toBe(join(sandbox.path, "out", "My Game-win32-x64"));
    expect(await readFile(join(String(result.outputs.output), "My Game.exe"), "utf8")).toBe(
      "patched",
    );
  });
  it("accepts the option through Package app's JSON configuration", async () => {
    await runAction(packageRunner, {
      sandboxPath: sandbox.path,
      inputs: {
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        configuration: { name: "My Game", patchExecutable: true },
      },
    });
    expect(patchExecutableWithGpupatch).toHaveBeenCalledTimes(1);
  });
  it("keeps existing omitted configuration disabled", async () => {
    await runAction(packageV2Runner, {
      sandboxPath: sandbox.path,
      inputs: {
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
      },
    });
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
  it("stops before copying output when patching fails", async () => {
    vi.mocked(patchExecutableWithGpupatch).mockRejectedValueOnce(new Error("patch failed"));
    await expect(
      runAction(packageV2Runner, {
        sandboxPath: sandbox.path,
        inputs: {
          "input-folder": sandbox.paths.input,
          platform: "win32",
          arch: "x64",
          name: "My Game",
          patchExecutable: true,
        },
      }),
    ).rejects.toThrow("patch failed");
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
  });
  it("does not invoke patching after Forge fails", async () => {
    vi.mocked(runWithLiveLogs).mockRejectedValueOnce(new Error("forge failed"));
    await expect(
      runAction(packageV2Runner, {
        sandboxPath: sandbox.path,
        inputs: {
          "input-folder": sandbox.paths.input,
          platform: "win32",
          arch: "x64",
          name: "My Game",
          patchExecutable: true,
        },
      }),
    ).rejects.toThrow("forge failed");
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
  it("does not patch Create installer", async () => {
    await runAction(makeRunner, {
      sandboxPath: sandbox.path,
      inputs: {
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        configuration: { name: "My Game", patchExecutable: true },
      },
    });
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
});
