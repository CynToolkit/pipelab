import { join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import pacote from "pacote";
import semver from "semver";
import { userDataPath } from "../context";

/**
 * Internal helper to fetch, cache, and resolve a Pipelab package from npm.
 */
async function fetchPipelabPackage(
  packageName: string,
  versionOrRange: string | undefined,
): Promise<{ packageDir: string; resolvedVersion: string }> {
  const baseDir = join(userDataPath, "packages", packageName);
  let resolvedVersion: string;

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
    console.log(`Downloading ${packageName}@${resolvedVersion} from npm...`);
    await mkdir(packageDir, { recursive: true });
    await pacote.extract(`${packageName}@${resolvedVersion}`, packageDir);
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
): Promise<string> {
  const { packageDir } = await fetchPipelabPackage(packageName, versionOrRange);
  return packageDir;
}

/**
 * High-level utility to fetch and cache a Pipelab plugin (e.g. @pipelab/plugin-steam).
 * Respects userDataPath/packages.
 */
export async function fetchPipelabPlugin(
  pluginName: string,
  versionOrRange?: string,
): Promise<string> {
  const { packageDir } = await fetchPipelabPackage(pluginName, versionOrRange);
  return packageDir;
}

/**
 * High-level utility to fetch and cache the Pipelab CLI JavaScript bundle.
 * Respects userDataPath/packages.
 * @returns The absolute path to the CLI entry point (dist/index.cjs).
 */
export async function fetchPipelabCli(versionOrRange?: string): Promise<string> {
  const packageName = "@pipelab/cli";
  const { packageDir } = await fetchPipelabPackage(packageName, versionOrRange);
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
