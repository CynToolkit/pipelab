import { dirname, delimiter, join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import pacote from "pacote";
import semver from "semver";
import { isDev, projectRoot, userDataPath } from "../context";

import { execa } from "execa";

type FetchOptions = {
  installDeps?: boolean;
  nodePath?: string;
  pnpmPath?: string;
};

/**
 * Internal helper to fetch, cache, and resolve a Pipelab package from npm.
 */
async function fetchPipelabPackage(
  packageName: string,
  versionOrRange: string | undefined,
  options?: FetchOptions,
): Promise<{ packageDir: string; resolvedVersion: string }> {
  const baseDir = join(userDataPath, "packages", packageName);
  let resolvedVersion: string;

  console.log(`[Fetcher] Resolving ${packageName}@${versionOrRange || "latest"}...`);

  try {
    // 1. Resolve version/range using npm
    const packument = await pacote.packument(packageName);
    const versions = Object.keys(packument.versions);

    const range = versionOrRange || "latest";
    const foundVersion = semver.maxSatisfying(versions, range) || packument["dist-tags"]?.[range];

    if (!foundVersion) {
      throw new Error(`Package ${packageName}@${range} not found on npm`);
    }
    resolvedVersion = foundVersion;
    console.log(`[Fetcher] ${packageName}: Resolved to v${resolvedVersion} via npm`);
  } catch (error) {
    console.warn(`[Fetcher] ${packageName}: remote resolution failed, trying local fallback...`);
    const fallbackVersion = await tryLocalFallback(versionOrRange, error, baseDir, packageName);
    if (fallbackVersion) {
      resolvedVersion = fallbackVersion;
      console.log(`[Fetcher] ${packageName}: Using local fallback v${resolvedVersion}`);
    } else {
      throw error;
    }
  }

  const packageDir = join(baseDir, resolvedVersion);
  const exists = existsSync(packageDir);

  if (!exists) {
    console.log(`[Fetcher] ${packageName}@${resolvedVersion}: Directory missing, downloading...`);
    await mkdir(packageDir, { recursive: true });
    await pacote.extract(`${packageName}@${resolvedVersion}`, packageDir);
  } else {
    console.log(`[Fetcher] ${packageName}@${resolvedVersion}: Directory exists at ${packageDir}`);
  }

  if (options?.installDeps) {
    const nodeModulesPath = join(packageDir, "node_modules");
    const hasNodeModules = existsSync(nodeModulesPath);

    if (!hasNodeModules) {
      console.log(`[Fetcher] ${packageName}: node_modules missing, triggering installation...`);
      try {
        let nodePath = options.nodePath;
        let pnpmPath = options.pnpmPath;

        if (!nodePath || !pnpmPath) {
          const { ensureNodeJS, ensurePNPM } = await import("./ensurers");
          if (!nodePath) {
            nodePath = await ensureNodeJS("24.14.1").catch(() => process.execPath);
          }
          if (!pnpmPath) {
            pnpmPath = await ensurePNPM().catch(() => "pnpm");
          }
        }

        // Use node to run pnpm if pnpmPath is a script
        const isScript = pnpmPath.endsWith(".cjs") || pnpmPath.endsWith(".js");
        const command = isScript ? nodePath : pnpmPath;
        const args = isScript
          ? [pnpmPath, "install", "--prod", "--no-lockfile"]
          : ["install", "--prod", "--no-lockfile"];

        console.log(`[Fetcher] ${packageName}: Running installation...`);
        console.log(`[Fetcher] ${packageName}: Command: ${command} ${args.join(" ")}`);
        console.log(`[Fetcher] ${packageName}: CWD: ${packageDir}`);

        const { all } = await execa(command, args, {
          cwd: packageDir,
          all: true, // Capture both stdout and stderr
          env: {
            ...process.env,
            NODE_ENV: "production",
            PATH: nodePath
              ? `${dirname(nodePath)}${delimiter}${process.env.PATH}`
              : process.env.PATH,
          },
        });

        if (all) {
          console.log(`[Fetcher] ${packageName}: Installation output:\n${all}`);
        }

        console.log(`[Fetcher] ${packageName}: Dependencies installed successfully`);
      } catch (err: any) {
        console.error(`[Fetcher] ${packageName}: Failed to install dependencies: ${err.message}`);
        if (err.all) {
          console.error(`[Fetcher] ${packageName}: Installation error output:\n${err.all}`);
        }
      }
    } else {
      console.log(`[Fetcher] ${packageName}: node_modules already exists, skipping installation`);
    }
  }

  return { packageDir, resolvedVersion };
}

/**
 * High-level utility to fetch and cache a Pipelab asset (e.g. @pipelab/asset-discord).
 * Respects userDataPath/packages.
 */
export async function fetchPipelabAsset(
  packageName: string,
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  if (isDev && projectRoot) {
    const assetId = packageName.replace("@pipelab/asset-", "");
    const localPath = join(projectRoot, "assets", `asset-${assetId}`);
    if (existsSync(localPath)) {
      return localPath;
    }
  }
  const { packageDir } = await fetchPipelabPackage(packageName, versionOrRange, options);
  return packageDir;
}

/**
 * High-level utility to fetch and cache a Pipelab plugin (e.g. @pipelab/plugin-steam).
 * Respects userDataPath/packages.
 */
export async function fetchPipelabPlugin(
  pluginName: string,
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  const { packageDir } = await fetchPipelabPackage(pluginName, versionOrRange, {
    installDeps: true, // Default to true for plugins
    ...options,
  });
  return packageDir;
}

/**
 * High-level utility to fetch and cache the Pipelab CLI JavaScript bundle.
 * Respects userDataPath/packages.
 * @returns The absolute path to the CLI entry point (dist/index.cjs).
 */
export async function fetchPipelabCli(
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  const packageName = "@pipelab/cli";
  const { packageDir } = await fetchPipelabPackage(packageName, versionOrRange, options);
  return join(packageDir, "dist", "index.mjs");
}
/**
 * Finds the latest semver-like version in a directory.
 */
async function findLatestLocalVersion(baseDir: string): Promise<string | null> {
  if (!existsSync(baseDir)) return null;

  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      // Basic numeric sort for versions (e.g. 1.10.0 > 1.2.0)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

    return versions[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Attempts to use a locally cached version when network fetch fails.
 * Returns the fallback version string if available, otherwise null.
 */
async function tryLocalFallback(
  version: string | undefined,
  error: unknown,
  baseDir: string,
  logPrefix: string,
): Promise<string | null> {
  // Only fallback for network errors
  console.warn(`[Fetcher] ${logPrefix}: Network failed, looking for local fallback...`);
  const latestLocal = await findLatestLocalVersion(baseDir);
  if (latestLocal) {
    console.info(`[Fetcher] ${logPrefix}: Using locally cached version: ${latestLocal}`);
    return latestLocal;
  }
  console.warn(`[Fetcher] ${logPrefix}: No local fallback found`);
  return null;
}
