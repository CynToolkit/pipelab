import { dirname, delimiter, join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import pacote from "pacote";
import semver from "semver";
import { isDev, projectRoot, userDataPath } from "../context";
import { execa } from "execa";

export type FetchOptions = {
  installDeps?: boolean;
  nodePath?: string;
  pnpmPath?: string;
  baseDir?: string;
};

/**
 * Robust utility to fetch, cache, and resolve an NPM package.
 * Centralized in core-node to avoid circular dependencies.
 */
export async function fetchPackage(
  packageName: string,
  versionOrRange: string | undefined,
  options?: FetchOptions,
): Promise<{ packageDir: string; resolvedVersion: string }> {
  const baseDir = options?.baseDir || join(userDataPath, "packages", packageName);
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
    } else {
      throw error;
    }
  }

  const packageDir = join(baseDir, resolvedVersion);
  if (!existsSync(packageDir)) {
    console.log(`[Fetcher] ${packageName}@${resolvedVersion}: Downloading to ${packageDir}...`);
    await mkdir(packageDir, { recursive: true });
    await pacote.extract(`${packageName}@${resolvedVersion}`, packageDir);
  }

  if (options?.installDeps) {
    await installDependencies(packageDir, packageName, options);
  }

  return { packageDir, resolvedVersion };
}

async function installDependencies(packageDir: string, packageName: string, options: FetchOptions) {
  const nodeModulesPath = join(packageDir, "node_modules");
  if (existsSync(nodeModulesPath)) return;

  console.log(`[Fetcher] ${packageName}: node_modules missing, triggering installation...`);
  try {
    let { nodePath, pnpmPath } = options;

    if (!nodePath || !pnpmPath) {
      const { ensureNodeJS, ensurePNPM } = await import("./ensurers");
      if (!nodePath) nodePath = await ensureNodeJS("24.14.1").catch(() => process.execPath);
      if (!pnpmPath) pnpmPath = await ensurePNPM().catch(() => "pnpm");
    }

    const isScript = pnpmPath.endsWith(".cjs") || pnpmPath.endsWith(".js");
    const command = isScript ? nodePath : pnpmPath;
    const args = isScript
      ? [pnpmPath, "install", "--prod", "--no-lockfile"]
      : ["install", "--prod", "--no-lockfile"];

    const { all } = await execa(command, args, {
      cwd: packageDir,
      all: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PATH: nodePath ? `${dirname(nodePath)}${delimiter}${process.env.PATH}` : process.env.PATH,
      },
    });

    if (all) console.log(`[Fetcher] ${packageName}: Installation output:\n${all}`);
  } catch (err: any) {
    console.error(`[Fetcher] ${packageName}: Failed to install dependencies: ${err.message}`);
    if (err.all) console.error(`[Fetcher] ${packageName}: Installation error output:\n${err.all}`);
  }
}

export async function fetchAsset(
  packageName: string,
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  if (isDev && projectRoot) {
    const assetId = packageName.replace("@pipelab/asset-", "");
    const localPath = join(projectRoot, "assets", `asset-${assetId}`);
    if (existsSync(localPath)) return localPath;
  }
  const { packageDir } = await fetchPackage(packageName, versionOrRange, options);
  return packageDir;
}

export async function fetchPlugin(
  pluginName: string,
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  const { packageDir } = await fetchPackage(pluginName, versionOrRange, {
    installDeps: true,
    ...options,
  });
  return packageDir;
}

export async function fetchCli(
  versionOrRange?: string,
  options?: FetchOptions,
): Promise<string> {
  const { packageDir } = await fetchPackage("@pipelab/cli", versionOrRange, options);
  return join(packageDir, "dist", "index.mjs");
}

async function findLatestLocalVersion(baseDir: string): Promise<string | null> {
  if (!existsSync(baseDir)) return null;
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
    return versions[0] || null;
  } catch {
    return null;
  }
}

async function tryLocalFallback(
  _version: string | undefined,
  _error: unknown,
  baseDir: string,
  logPrefix: string,
): Promise<string | null> {
  const latestLocal = await findLatestLocalVersion(baseDir);
  if (latestLocal) {
    console.info(`[Fetcher] ${logPrefix}: Using locally cached version: ${latestLocal}`);
    return latestLocal;
  }
  return null;
}
