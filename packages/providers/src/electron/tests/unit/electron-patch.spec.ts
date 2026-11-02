import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import {
  runPnpm,
  runWithLiveLogs,
  resolveBundledAsset,
  type ProviderHostContext,
} from "@pipelab/plugin-core";
import {
  electronPackageWorkflowTaskFactory,
  type ElectronWorkflowTaskServices,
} from "../../package-v2";
import { forge } from "../../forge";
import { defaultElectronConfig } from "../../utils";
import { patchExecutableWithGpupatch } from "../../gpupatch";

vi.mock("@pipelab/plugin-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pipelab/plugin-core")>()),
  runPnpm: vi.fn().mockResolvedValue({ all: "" }),
  runWithLiveLogs: vi.fn(),
  resolveBundledAsset: vi.fn(),
}));
vi.mock("../../gpupatch", () => ({
  patchExecutableWithGpupatch: vi.fn(),
}));

let sandbox: Awaited<ReturnType<typeof createSandbox>>;
const createContext = (): ProviderHostContext => ({
  releaseTag: "beta",
  getPackagesPath: (...parts) => join(sandbox.path, "packages", ...parts),
  getThirdPartyPath: (...parts) => join(sandbox.path, "thirdparty", ...parts),
  getTempPath: (...parts) => join(sandbox.path, "temp", ...parts),
  createTempFolder: async (prefix = "tmp") => {
    const base = join(sandbox.path, "temp");
    await mkdir(base, { recursive: true });
    return mkdtemp(join(base, prefix));
  },
  getCachePath: (folder = "pipelines", ...parts) => join(sandbox.path, "cache", folder, ...parts),
  getPnpmPath: (...parts) => join(sandbox.path, "pnpm", ...parts),
  getNodePath: () => process.execPath,
  getConnectionsPath: () => join(sandbox.path, "connections.json"),
  ensureNodeJS: async () => process.execPath,
  ensurePNPM: async () => "pnpm",
  resolveBundledAsset: async () => join(sandbox.path, "asset-electron"),
});
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
    const arch = args[args.indexOf("--arch") + 1];
    const output = args.includes("make")
      ? join(String(options.cwd), "out", "make")
      : join(String(options.cwd), "out", `My Game-${target}-${arch}`);
    await mkdir(output, { recursive: true });
    if (target === "darwin") {
      const framework = join(
        output,
        "My Game.app",
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
      );
      await mkdir(join(framework, "Versions", "A"), { recursive: true });
      await writeFile(join(framework, "Versions", "A", "Electron Framework"), "framework");
      await symlink("A", join(framework, "Versions", "Current"));
      await symlink("Versions/Current/Electron Framework", join(framework, "Electron Framework"));
    } else {
      await writeFile(join(output, target === "win32" ? "My Game.exe" : "My Game"), "original");
    }
  });
  vi.mocked(patchExecutableWithGpupatch).mockImplementation(async (binary, platform) => {
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
    if (platform === "win32") await writeFile(binary, "patched");
  });
});
afterEach(async () => {
  await sandbox.remove();
});

const mockSuccessfulInstall = (electronVersion = "39.2.3") => {
  const install = async (cwd: string) => {
    const electron = join(cwd, "node_modules", "electron");
    await mkdir(electron, { recursive: true });
    await writeFile(join(electron, "package.json"), JSON.stringify({ version: electronVersion }));
    const forgeCli = join(cwd, "node_modules", "@electron-forge", "cli", "dist");
    await mkdir(forgeCli, { recursive: true });
    await writeFile(join(forgeCli, "electron-forge.js"), "");
    const esbuild = join(cwd, "node_modules", "esbuild");
    await mkdir(join(esbuild, "lib"), { recursive: true });
    await writeFile(join(esbuild, "package.json"), JSON.stringify({ type: "commonjs" }));
    await writeFile(
      join(esbuild, "lib", "main.js"),
      'exports.build = async ({ outfile }) => { const fs = require("node:fs/promises"); const path = require("node:path"); await fs.mkdir(path.dirname(outfile), { recursive: true }); await fs.writeFile(outfile, "built"); };',
    );
    return { all: "" } as Awaited<ReturnType<typeof runPnpm>>;
  };
  vi.mocked(runPnpm).mockImplementation(install);
  return install;
};

describe("Electron executable patching", () => {
  const runPackage = async (
    inputs: Record<string, unknown>,
    workspacePath = sandbox.path,
    signal?: AbortSignal,
    log: (...args: unknown[]) => void = () => undefined,
  ) => {
    await mkdir(workspacePath, { recursive: true });
    const services = {
      context: createContext(),
      executables: { node: process.execPath, pnpm: "pnpm" },
      workflowCachePath: join(sandbox.path, "cache"),
    } satisfies ElectronWorkflowTaskServices;

    return runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
      workspacePath,
      inputs,
      services,
      signal,
      host: {
        logger: {
          info: (...args) => log(...args),
          warn: (...args) => log(...args),
          error: (...args) => log(...args),
        },
      },
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
  it("preserves relative macOS framework symlinks in the staged output", async () => {
    const result = await runPackage({
      "input-folder": sandbox.paths.input,
      platform: "darwin",
      arch: "arm64",
      name: "My Game",
    });
    const framework = join(
      String(result.outputs.output),
      "My Game.app",
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
    );

    expect(await readlink(join(framework, "Electron Framework"))).toBe(
      "Versions/Current/Electron Framework",
    );
    expect(await readlink(join(framework, "Versions", "Current"))).toBe("A");
    expect(await readFile(await realpath(join(framework, "Electron Framework")), "utf8")).toBe(
      "framework",
    );
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
    const logs: unknown[][] = [];
    await runPackage(
      {
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
      },
      sandbox.path,
      undefined,
      (...args) => logs.push(args),
    );
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
    expect(runPnpm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runPnpm).mock.calls[0]?.[1].args).toEqual(["install", "--prefer-offline"]);
    expect(logs.flat().join(" ")).toMatch(/Electron dependency installation completed in \d+ms/);
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
  it("installs the composed template, custom packages, and legacy overrides once", async () => {
    const successfulInstall = mockSuccessfulInstall();
    let generatedManifest: Record<string, unknown> | undefined;
    vi.mocked(runPnpm).mockImplementation(async (cwd) => {
      generatedManifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as Record<
        string,
        unknown
      >;
      return successfulInstall(cwd);
    });
    const assetFolder = join(sandbox.path, "asset-electron");
    await writeFile(
      join(assetFolder, "template", "package.json"),
      JSON.stringify({
        name: "template",
        dependencies: { execa: "^9.4.0", "serve-handler": "^6.1.6" },
        devDependencies: { electron: "39.2.3", "@electron-forge/cli": "7.11.1" },
        pnpm: { overrides: { "discord-rpc>register-scheme": "-" } },
      }),
    );

    await runPackage({
      "input-folder": sandbox.paths.input,
      platform: "linux",
      arch: "x64",
      name: "My Game",
      electronVersion: "27.3.11",
      customPackages: ["is-number@7.0.0"],
    });

    expect(runPnpm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runPnpm).mock.calls[0]?.[1].args).toEqual([
      "add",
      "is-number@7.0.0",
      "--prefer-offline",
    ]);
    expect(generatedManifest).toBeDefined();
    expect(generatedManifest?.type).toBe("commonjs");
    expect(generatedManifest?.dependencies).toMatchObject({ execa: "8" });
    expect(generatedManifest?.devDependencies).toMatchObject({
      electron: "27.3.11",
      esbuild: "0.24.0",
    });
    expect(generatedManifest?.pnpm).toMatchObject({
      overrides: {
        "discord-rpc>register-scheme": "-",
      },
    });
  });
  it.each([
    {
      configuredVersion: "27.3.11",
      customVersion: "39.8.10",
      effectiveType: "module",
      expectedLegacyDependenciesBeforeInstall: true,
    },
    {
      configuredVersion: "39.8.10",
      customVersion: "27.3.11",
      effectiveType: "commonjs",
      expectedLegacyDependenciesBeforeInstall: true,
    },
  ])(
    "honors custom Electron $customVersion over configured $configuredVersion and uses its module mode",
    async ({
      configuredVersion,
      customVersion,
      effectiveType,
      expectedLegacyDependenciesBeforeInstall,
    }) => {
      const successfulInstall = mockSuccessfulInstall(customVersion);
      let generatedManifest: Record<string, unknown> | undefined;
      let stagedManifest: Record<string, unknown> | undefined;
      let stagedConfiguration: Record<string, unknown> | undefined;
      vi.mocked(runPnpm).mockImplementation(async (cwd) => {
        const manifestPath = join(cwd, "package.json");
        generatedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
          string,
          unknown
        >;
        const dependencies = generatedManifest.dependencies as Record<string, string>;
        const devDependencies = generatedManifest.devDependencies as Record<string, string>;
        await writeFile(
          manifestPath,
          JSON.stringify({
            ...generatedManifest,
            dependencies: { ...dependencies, execa: "9.4.0" },
            devDependencies: { ...devDependencies, electron: customVersion, esbuild: "0.25.0" },
          }),
        );
        return successfulInstall(cwd);
      });
      vi.mocked(runWithLiveLogs).mockImplementationOnce(async (_command, args, options) => {
        const cwd = String(options.cwd);
        stagedManifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as Record<
          string,
          unknown
        >;
        const configText = await readFile(join(cwd, "config.cjs"), "utf8");
        stagedConfiguration = JSON.parse(configText.replace("module.exports = ", "")) as Record<
          string,
          unknown
        >;
        const target = args[args.indexOf("--platform") + 1];
        const arch = args[args.indexOf("--arch") + 1];
        const output = join(cwd, "out", `My Game-${target}-${arch}`);
        await mkdir(output, { recursive: true });
        await writeFile(join(output, target === "win32" ? "My Game.exe" : "My Game"), "binary");
      });

      await runPackage({
        "input-folder": sandbox.paths.input,
        platform: "win32",
        arch: "x64",
        name: "My Game",
        electronVersion: configuredVersion,
        customPackages: [`electron@${customVersion}`, "execa@9.4.0", "esbuild@0.25.0"],
      });

      expect(runPnpm).toHaveBeenCalledTimes(1);
      expect(vi.mocked(runPnpm).mock.calls[0]?.[1].args).toEqual([
        "add",
        `electron@${customVersion}`,
        "execa@9.4.0",
        "esbuild@0.25.0",
        "--prefer-offline",
      ]);
      const generatedDependencies = generatedManifest?.dependencies as
        | Record<string, string>
        | undefined;
      const generatedDevDependencies = generatedManifest?.devDependencies as
        | Record<string, string>
        | undefined;
      expect(generatedDependencies?.execa).toBe(
        expectedLegacyDependenciesBeforeInstall ? "8" : undefined,
      );
      expect(generatedDevDependencies?.esbuild).toBe(
        expectedLegacyDependenciesBeforeInstall ? "0.24.0" : undefined,
      );
      expect(stagedManifest).toMatchObject({
        type: effectiveType,
        dependencies: { execa: "9.4.0" },
        devDependencies: { electron: customVersion, esbuild: "0.25.0" },
      });
      expect(stagedConfiguration?.electronVersion).toBe(customVersion);
    },
  );
  it("cleans up when pnpm rejects an invalid custom dependency", async () => {
    const invalidPackage = "pipelab-package-that-does-not-exist@0.0.0";
    const logs: unknown[][] = [];
    vi.mocked(runPnpm).mockRejectedValueOnce(
      new Error(`ERR_PNPM_NO_MATCHING_VERSION: no matching version for ${invalidPackage}`),
    );

    await expect(
      runPackage(
        {
          "input-folder": sandbox.paths.input,
          platform: "linux",
          arch: "x64",
          name: "My Game",
          customPackages: [invalidPackage],
        },
        sandbox.path,
        undefined,
        (...args) => logs.push(args),
      ),
    ).rejects.toThrow("ERR_PNPM_NO_MATCHING_VERSION");

    expect(runPnpm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runPnpm).mock.calls[0]?.[1].args).toEqual([
      "add",
      invalidPackage,
      "--prefer-offline",
    ]);
    expect(runWithLiveLogs).not.toHaveBeenCalled();
    expect(await readdir(join(sandbox.path, "temp"))).toEqual([]);
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
    const logText = logs.flat().join(" ");
    expect(logText).toMatch(/Electron dependency installation failed after \d+ms/);
    expect(logText).not.toContain(invalidPackage);
    expect(logText).not.toMatch(/Electron dependency installation completed/);
  });
  it("passes cancellation to pnpm and does not produce an artifact", async () => {
    const controller = new AbortController();
    const logs: unknown[][] = [];
    vi.mocked(runPnpm).mockImplementationOnce(async (_cwd, { signal }) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      throw new Error("dependency install cancelled");
    });

    await expect(
      runPackage(
        {
          "input-folder": sandbox.paths.input,
          platform: "linux",
          arch: "x64",
          name: "My Game",
        },
        sandbox.path,
        controller.signal,
        (...args) => logs.push(args),
      ),
    ).rejects.toThrow(/aborted/i);

    expect(runWithLiveLogs).not.toHaveBeenCalled();
    expect(await readdir(join(sandbox.path, "temp"))).toEqual([]);
    await expect(access(join(sandbox.path, "out"))).rejects.toThrow();
    const logText = logs.flat().join(" ");
    expect(logText).toMatch(/Electron dependency installation canceled after \d+ms/);
    expect(logText).not.toMatch(/Electron dependency installation completed/);
  });
  it("keeps outputs and staging independent for concurrent target architectures", async () => {
    const inputs = (arch: string) => ({
      "input-folder": sandbox.paths.input,
      platform: "linux",
      arch,
      name: "My Game",
    });
    const firstWorkspace = join(sandbox.path, "target-x64");
    const secondWorkspace = join(sandbox.path, "target-arm64");

    const [first, second] = await Promise.all([
      runPackage(inputs("x64"), firstWorkspace),
      runPackage(inputs("arm64"), secondWorkspace),
    ]);

    expect(first.outputs.output).toBe(join(firstWorkspace, "out", "My Game-linux-x64"));
    expect(second.outputs.output).toBe(join(secondWorkspace, "out", "My Game-linux-arm64"));
    expect(first.outputs.output).not.toBe(second.outputs.output);
    expect(runPnpm).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runPnpm).mock.calls[0]?.[0]).not.toBe(vi.mocked(runPnpm).mock.calls[1]?.[0]);
    const packageTemporaryFolders = vi
      .mocked(runWithLiveLogs)
      .mock.calls.map(([, , options]) => options.env?.TMPDIR);
    expect(packageTemporaryFolders).toHaveLength(2);
    expect(new Set(packageTemporaryFolders).size).toBe(2);
    for (const folder of packageTemporaryFolders) {
      if (typeof folder !== "string") throw new Error("Missing isolated Electron temp directory");
      await expect(access(folder)).rejects.toThrow();
    }
    await expect(access(join(String(first.outputs.output), "My Game"))).resolves.not.toThrow();
    await expect(access(join(String(second.outputs.output), "My Game"))).resolves.not.toThrow();
  });
  it("does not patch the installer output", async () => {
    const context = createContext();
    await forge(
      "make",
      sandbox.paths.input,
      {
        cwd: sandbox.path,
        log: () => undefined,
        inputs: { platform: "win32", arch: "x64" },
        paths: { node: process.execPath, pnpm: "pnpm" },
        abortSignal: new AbortController().signal,
        phase: async (_id, callback) => {
          await callback({
            success: (message) => ({ status: "completed", message }),
            skip: (reason) => ({ status: "skipped", reason }),
            fail: (error) => {
              throw error instanceof Error ? error : new Error(String(error));
            },
            warn: () => undefined,
          });
        },
        context,
        setArtifact: () => undefined,
      },
      { ...defaultElectronConfig, name: "My Game", patchExecutable: true },
    );
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });

  it("reports executable patching as skipped for non-Windows targets", async () => {
    const phaseOutcomes = new Map<string, { status: string; reason?: string }>();
    const phaseTools = {
      success: (message?: string) => ({ status: "completed" as const, message }),
      skip: (reason: string) => ({ status: "skipped" as const, reason }),
      fail: (error: unknown): never => {
        throw error instanceof Error ? error : new Error(String(error));
      },
      warn: () => undefined,
    };

    await forge(
      "package",
      sandbox.paths.input,
      {
        cwd: sandbox.path,
        log: () => undefined,
        inputs: { platform: "linux", arch: "x64" },
        paths: { node: process.execPath, pnpm: "pnpm" },
        abortSignal: new AbortController().signal,
        phase: async (id, callback) => {
          const outcome = await callback(phaseTools);
          if (outcome) phaseOutcomes.set(id, outcome);
        },
        context: createContext(),
        setArtifact: () => undefined,
      },
      { ...defaultElectronConfig, name: "My Game", patchExecutable: true },
    );

    expect(phaseOutcomes.get("patch")).toEqual({
      status: "skipped",
      reason: "Executable patching is only supported on Windows",
    });
    expect(patchExecutableWithGpupatch).not.toHaveBeenCalled();
  });
});

vi.mock("../../../web-runtime", () => ({ detectRuntime: vi.fn() }));
