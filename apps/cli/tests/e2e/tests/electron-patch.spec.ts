import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import { PipelabContext } from "@pipelab/core-node";
import { runWithLiveLogs, resolveBundledAsset } from "@pipelab/plugin-core";
import {
  electronPackageWorkflowTaskFactory,
  type ElectronWorkflowTaskServices,
} from "../../../../../plugins/plugin-electron/src/package-v2";
import { forge } from "../../../../../plugins/plugin-electron/src/forge";
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
  const runPackage = (inputs: Record<string, unknown>) => {
    const services = {
      context: new PipelabContext({ userDataPath: join(sandbox.path, "user-data") }),
      executables: { node: process.execPath, pnpm: "pnpm" },
      workflowCachePath: join(sandbox.path, "cache"),
    } satisfies ElectronWorkflowTaskServices;

    return runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
      workspacePath: sandbox.path,
      inputs,
      services,
      artifacts: {
        "electron-build": {
          descriptor: {
            kind: "application",
            technology: "electron",
            platform: "windows",
            architecture: "x64",
            container: "directory",
          },
        },
      },
    });
  };

  it("keeps executable patching opt-in by default", () => {
    expect(defaultElectronConfig.patchExecutable).toBe(false);
  });
  it("patches the staged Windows target and publishes the patched copy", async () => {
    const result = await runPackage({
      "input-folder": sandbox.paths.input,
      platform: "win32",
      arch: "x64",
      name: "My Game",
      patchExecutable: true,
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
  it("keeps existing omitted configuration disabled", async () => {
    await runPackage({
      "input-folder": sandbox.paths.input,
      platform: "win32",
      arch: "x64",
      name: "My Game",
    });
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
  it("stops before copying output when patching fails", async () => {
    vi.mocked(patchExecutableWithGpupatch).mockRejectedValueOnce(new Error("patch failed"));
    await expect(
      runPackage({
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
        patchExecutable: true,
      }),
    ).rejects.toThrow("patch failed");
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
  });
  it("does not invoke patching after Forge fails", async () => {
    vi.mocked(runWithLiveLogs).mockRejectedValueOnce(new Error("forge failed"));
    await expect(
      runPackage({
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
        patchExecutable: true,
      }),
    ).rejects.toThrow("forge failed");
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
  it("does not patch the installer output", async () => {
    const context = new PipelabContext({ userDataPath: join(sandbox.path, "user-data") });
    await forge(
      "make",
      sandbox.paths.input,
      {
        cwd: sandbox.path,
        log: () => undefined,
        inputs: { platform: "win32", arch: "x64" },
        paths: { node: process.execPath, pnpm: "pnpm" },
        abortSignal: new AbortController().signal,
        context,
        setArtifact: () => undefined,
      },
      { ...defaultElectronConfig, name: "My Game", patchExecutable: true },
    );
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
});
