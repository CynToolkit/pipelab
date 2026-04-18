import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile, symlink, rm, readdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { execa } from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/**
 * Utility to check if current platform matches target(s).
 * Useful for it.runIf(onlyOn('win32'))
 */
export const onlyOn = (platforms: NodeJS.Platform | NodeJS.Platform[]) => {
  const target = Array.isArray(platforms) ? platforms : [platforms];
  return target.includes(process.platform);
};

/**
 * Robustly resolves the project root relative to this utility file.
 */
export const projectRoot = resolve(__dirname, "../../../../../");

/**
 * Robustly resolves the fixtures path relative to this utility file.
 */
export const fixturesPath = resolve(__dirname, "../fixtures");

/**
 * Discovers and symlinks monorepo packages into the sandbox.
 */
async function symlinkMonorepoPackages(sandboxPath: string) {
  const folders = ["packages", "apps"];
  const targetRoot = join(sandboxPath, "packages");

  for (const folder of folders) {
    const parentDir = resolve(projectRoot, folder);
    const entries = await readdir(parentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgJsonPath = join(parentDir, entry.name, "package.json");
        try {
          const pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
          if (pkg.name && pkg.name.startsWith("@pipelab/")) {
            const version = pkg.version;
            const linkPath = join(targetRoot, pkg.name, version);
            await mkdir(dirname(linkPath), { recursive: true });

            // If already exists (e.g. from multiple test runs), skip
            try {
              await symlink(join(parentDir, entry.name), linkPath, "dir");
            } catch (e: any) {
              if (e.code !== "EEXIST") throw e;
            }
          }
        } catch (e) {
          // Skip folders without package.json
        }
      }
    }
  }
}

/**
 * Creates a unique sandbox directory and returns a bundle containing its path
 * and a pre-filled remove utility.
 */
export const createSandbox = async (prefix: string) => {
  const sandboxPath = join(tmpdir(), `${prefix}-${Math.random().toString(36).substring(7)}`);
  await mkdir(sandboxPath, { recursive: true });

  return {
    path: sandboxPath,
    remove: async () => {
      // Use native retry logic for robust directory removal
      await rm(sandboxPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    },
  };
};

/**
 * Runs a Pipelab pipeline using the CLI.
 */
export const runPipeline = async (
  pipeline: object,
  sandboxPath: string,
  options: {
    extraEnv?: Record<string, string>;
    userData?: string;
    cwd?: string;
  } = {},
) => {
  const pipelineFile = join(sandboxPath, "pipeline.json");
  const resultFile = join(sandboxPath, "result.json");
  await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));

  // Symlink packages to avoid npm download failures in tests
  await symlinkMonorepoPackages(sandboxPath);

  const cliPath = resolve(projectRoot, "apps/cli/dist/index.cjs");

  const args = [cliPath, "run", pipelineFile, "--output", resultFile];

  const userData = options.userData || sandboxPath;
  args.push("--user-data", userData);

  // Use a specialized version of runWithLiveLogs to avoid dependency on the built shared package
  const child = execa(process.execPath, args, {
    cwd: options.cwd || projectRoot,
    cleanup: true,
    env: {
      ...process.env,
      ...options.extraEnv,
      PIPELAB_DISABLE_HISTORY: "true",
    },
  });

  child.stdout?.on("data", (data) =>
    console.log(`[Pipelab CLI] stdout: ${data.toString().trim()}`),
  );
  child.stderr?.on("data", (data) =>
    console.log(`[Pipelab CLI] stderr: ${data.toString().trim()}`),
  );

  await child;

  const resultRaw = await readFile(resultFile, "utf-8");
  return JSON.parse(resultRaw);
};

/**
 * Runs a packaged Electron application and captures its output.
 */
export const runElectronApp = async (
  binaryPath: string,
  options: {
    timeoutMs?: number;
    args?: string[];
    env?: Record<string, string>;
  } = {},
) => {
  const args = options.args || [];
  if (!args.includes("--no-sandbox")) {
    args.push("--no-sandbox");
  }

  const timeoutMs = options.timeoutMs || 15000;

  let command = binaryPath;
  let finalArgs = args;

  if (isLinux) {
    command = "xvfb-run";
    finalArgs = ["--auto-servernum", binaryPath, ...args];
  }

  const child = execa(command, finalArgs, {
    cleanup: true,
    env: {
      ...process.env,
      ...options.env,
      ELECTRON_ENABLE_LOGGING: "1",
    },
    // Don't use execa timeout here because we want to kill it manually or let it timeout and catch it
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[Electron Binary] stdout: ${text}`);
    stdout += text;
  });
  child.stderr?.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[Electron Binary] stderr: ${text}`);
    stderr += text;
  });

  // Kill the process after timeoutMs
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, timeoutMs);

  try {
    await child;
  } catch (e: any) {
    // Expected if we kill it
  } finally {
    clearTimeout(timeout);
  }

  return { stdout, stderr };
};
