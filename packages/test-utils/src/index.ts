import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync as existsSyncSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ActionRunner, ActionRunnerData, Action } from "@pipelab/plugin-core";
import { execa } from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Finds the monorepo root by looking for pnpm-workspace.yaml.
 */
export function findProjectRoot(startDir: string): string {
  let curr = startDir;
  while (curr !== dirname(curr)) {
    if (existsSyncSync(join(curr, "pnpm-workspace.yaml"))) {
      return curr;
    }
    curr = dirname(curr);
  }
  throw new Error("Could not find project root (pnpm-workspace.yaml)");
}

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/**
 * Creates a unique sandbox directory and returns a bundle containing its path
 * and a pre-filled remove utility.
 */
export const createSandbox = async (prefix: string) => {
  const sandboxPath = join(tmpdir(), `${prefix}-${Math.random().toString(36).substring(7)}`);

  const paths = {
    input: join(sandboxPath, "input"),
    output: join(sandboxPath, "output"),
    userData: join(sandboxPath, "user-data"),
    project: join(sandboxPath, "project"),
    thirdparty: join(sandboxPath, "thirdparty"),
  };

  await mkdir(sandboxPath, { recursive: true });
  await Promise.all([
    mkdir(paths.input, { recursive: true }),
    mkdir(paths.output, { recursive: true }),
    mkdir(paths.userData, { recursive: true }),
  ]);

  return {
    path: sandboxPath,
    paths,
    /**
     * Creates a mock binary/script in the sandbox.
     */
    mockBinary: async (
      relativePath: string,
      content?: string,
      options: { extension?: string | false } = {},
    ) => {
      const fullPath = join(sandboxPath, relativePath);
      let platformPath = fullPath;

      if (options.extension === false) {
        // Use exactly the path provided
      } else if (options.extension) {
        platformPath = `${fullPath}.${options.extension}`;
      } else {
        const hasExtension = /\.[a-z0-9]+$/i.test(relativePath);
        platformPath = hasExtension ? fullPath : isWindows ? `${fullPath}.cmd` : `${fullPath}.sh`;
      }

      const defaultContent = isWindows
        ? `@echo off\necho Mock Binary Execution: %*\nexit /b 0`
        : `#!/bin/bash\necho "Mock Binary Execution: $@"\nexit 0`;

      await mkdir(dirname(platformPath), { recursive: true });
      await writeFile(platformPath, content || defaultContent);

      if (!isWindows) {
        await chmod(platformPath, 0o755);
      }

      return platformPath;
    },
    remove: async () => {
      await rm(sandboxPath, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 500,
      });
    },
  };
};

/**
 * Runs the Pipelab CLI out-of-process.
 */
export const runCLI = async (
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
  } = {},
) => {
  const projectRoot = findProjectRoot(__dirname);
  const cliPath = resolve(projectRoot, "apps/cli/src/index.ts");

  return execa("tsx", [cliPath, ...args], {
    cwd: options.cwd || projectRoot,
    env: {
      ...process.env,
      PIPELAB_DISABLE_HISTORY: "true",
      ...options.env,
    },
  });
};

/**
 * Runs a Pipelab action runner directly in-process for focused testing.
 */
export const runAction = async <A extends Action>(
  runner: ActionRunner<A>,
  options: {
    inputs: ActionRunnerData<A>["inputs"];
    sandboxPath: string;
    extraEnv?: Record<string, string>;
  },
): Promise<{ outputs: Record<string, unknown> }> => {
  const outputs: Record<string, unknown> = {};

  // Create a pnpm shim because ensureNPMPackage expects a JS file runnable by node
  const pnpmShimPath = join(options.sandboxPath, "pnpm-shim.cjs");
  await writeFile(
    pnpmShimPath,
    `const { spawnSync } = require('child_process');
spawnSync('pnpm', process.argv.slice(2), { stdio: 'inherit', shell: true });`,
  );

  const context: ActionRunnerData<A> = {
    inputs: options.inputs,
    log: (...args: any[]) => {
      console.log("[Runner Log]", ...args);
    },
    setOutput: (key: any, value: any) => {
      console.log(`[Runner Output] ${key} = ${value}`);
      outputs[key] = value;
    },
    cwd: options.sandboxPath,
    paths: {
      assets: join(options.sandboxPath, "assets"),
      cache: join(options.sandboxPath, "cache"),
      pnpm: pnpmShimPath,
      node: process.execPath,
      userData: join(options.sandboxPath, "user-data"),
      modules: join(options.sandboxPath, "modules"),
      thirdparty: join(options.sandboxPath, "thirdparty"),
    },
    api: {
      fetchAsset: async (packageName: string) => {
        const sandboxAssetPath = join(options.sandboxPath, "assets", packageName);
        if (existsSyncSync(sandboxAssetPath)) {
          return sandboxAssetPath;
        }
        // Fallback to real monorepo assets
        // Normalize: remove @pipelab/ prefix if present
        const folderName = packageName.startsWith("@pipelab/")
          ? packageName.replace("@pipelab/", "")
          : packageName;

        const projectRoot = findProjectRoot(__dirname);
        return join(projectRoot, "assets", folderName);
      },
    },
    // @ts-ignore - Mocking BrowserWindow
    browserWindow: undefined,
    abortSignal: new AbortController().signal,
    // @ts-ignore - Mocking setMeta
    setMeta: () => {},
    meta: {} as any,
  };

  // Set environment variables for the test if provided
  const originalEnv = { ...process.env };
  if (options.extraEnv) {
    Object.assign(process.env, options.extraEnv);
  }

  try {
    await runner(context);
  } finally {
    // Restore original environment
    if (options.extraEnv) {
      // Remove keys that were added
      for (const key in options.extraEnv) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      // Restore original values
      Object.assign(process.env, originalEnv);
    }
  }

  return { outputs };
};

/**
 * Runs the packaged electron app (smoke test)
 */
export const runElectronApp = async (app_path: string, options: { timeoutMs?: number } = {}) => {
  const child = execa(app_path, [], {
    cleanup: true,
    timeout: options.timeoutMs || 120000,
  });
  return child;
};
