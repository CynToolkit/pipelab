import { join } from "node:path";
import { mkdir, writeFile, chmod, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import AdmZip from "adm-zip";
import { userDataPath } from "../context";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

/**
 * Fetches release information from GitHub for a specific package.
 */
export async function fetchReleaseInfo(
  repo: string,
  packageName: string,
  version?: string
): Promise<ReleaseInfo> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: { "User-Agent": "Pipelab-Core" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch releases from ${repo}: ${response.statusText}`);
  }

  const releases: ReleaseInfo[] = await response.json();
  
  let targetRelease;
  if (version) {
    targetRelease = releases.find((r) => r.tag_name === `${packageName}@${version}`);
  } else {
    // Find the latest release for this specific package
    targetRelease = releases.find((r) => r.tag_name.startsWith(`${packageName}@`));
  }

  if (!targetRelease) {
    throw new Error(`No release found for package ${packageName}${version ? `@${version}` : ""}`);
  }

  return targetRelease;
}

/**
 * Downloads a zip asset and extracts it to a destination directory.
 */
export async function downloadAndExtractZip(url: string, destDir: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download zip from ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await mkdir(destDir, { recursive: true });
  
  const zip = new AdmZip(Buffer.from(buffer));
  zip.extractAllTo(destDir, true);
}

/**
 * Downloads a single asset from a URL to a destination path.
 */
export async function downloadAsset(url: string, destPath: string, makeExecutable = false): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download asset from ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await mkdir(join(destPath, ".."), { recursive: true });
  await writeFile(destPath, Buffer.from(buffer));

  if (makeExecutable && process.platform !== "win32") {
    await chmod(destPath, 0o755);
  }
}

/**
 * High-level utility to fetch and cache a Pipelab asset (e.g. @pipelab/ui).
 * Respects userDataPath/cache.
 */
export async function fetchPipelabAsset(packageName: string, version?: string): Promise<string> {
  const assetBaseDir = join(userDataPath, "cache", packageName);

  // 1. If a specific version is requested, check local cache FIRST
  if (version) {
    const assetDir = join(assetBaseDir, version);
    if (existsSync(assetDir)) {
      return assetDir;
    }
  }

  let targetRelease: ReleaseInfo;
  let resolvedVersion: string;

  try {
    // 2. Try to fetch from GitHub
    targetRelease = await fetchReleaseInfo("CynToolkit/pipelab", packageName, version);
    resolvedVersion = targetRelease.tag_name.split("@").pop()!;
  } catch (error) {
    // 3. Network Failure: Try local fallback for actual network errors (not "release not found")
    const fallbackVersion = await tryLocalFallback(version, error, assetBaseDir, packageName);
    if (fallbackVersion) {
      return join(assetBaseDir, fallbackVersion);
    }
    throw error; // Re-throw: either release not found, specific version failed, or no local fallback
  }

  const assetDir = join(assetBaseDir, resolvedVersion);
  if (existsSync(assetDir)) {
    return assetDir;
  }

  console.log(`Downloading assets for ${packageName}@${resolvedVersion}...`);
  const asset = targetRelease.assets.find((a) => a.name === "asset.zip");
  if (!asset) {
    throw new Error(`No asset.zip found in release ${targetRelease.tag_name}`);
  }

  await downloadAndExtractZip(asset.browser_download_url, assetDir);
  return assetDir;
}

/**
 * High-level utility to fetch and cache the Pipelab CLI binary.
 * Respects userDataPath/bin.
 */
export async function fetchPipelabCli(version?: string): Promise<string> {
  const packageName = "@pipelab/cli";
  const binBaseDir = join(userDataPath, "bin");

  // Determine platform and architecture naming
  const platformMap: Record<string, string> = {
    win32: "win",
    darwin: "macos",
    linux: "linux",
  };
  const os = platformMap[process.platform] || process.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch;
  const suffix = os === "win" ? ".exe" : "";

  // 1. If a specific version is requested, check local bin folder FIRST
  if (version) {
    const binaryName = `pipelab-cli-v${version}-${os}-${arch}${suffix}`;
    const binaryPath = join(binBaseDir, version, binaryName);
    if (existsSync(binaryPath)) {
      return binaryPath;
    }
  }

  let targetRelease: ReleaseInfo;
  let resolvedVersion: string;

  try {
    // 2. Try to fetch from GitHub
    targetRelease = await fetchReleaseInfo("CynToolkit/pipelab", packageName, version);
    resolvedVersion = targetRelease.tag_name.split("@").pop()!;
  } catch (error) {
    // 3. Network Failure: Try local fallback for actual network errors (not "release not found")
    const fallbackVersion = await tryLocalFallback(version, error, binBaseDir, "CLI");
    if (fallbackVersion) {
      const binaryName = `pipelab-cli-v${fallbackVersion}-${os}-${arch}${suffix}`;
      const binaryPath = join(binBaseDir, fallbackVersion, binaryName);
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    }
    throw error;
  }

  const binaryName = `pipelab-cli-v${resolvedVersion}-${os}-${arch}${suffix}`;
  const binDir = join(binBaseDir, resolvedVersion);
  const binaryPath = join(binDir, binaryName);

  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  console.log(`Downloading Pipelab CLI ${resolvedVersion} for ${os}-${arch}...`);
  const asset = targetRelease.assets.find((a) => a.name === binaryName);
  if (!asset) {
    throw new Error(`No binary found for ${binaryName} in release ${targetRelease.tag_name}`);
  }

  await downloadAsset(asset.browser_download_url, binaryPath, true);
  return binaryPath;
}

/**
 * Finds the latest semver-like version in a directory.
 */
async function findLatestLocalVersion(baseDir: string): Promise<string | null> {
  if (!existsSync(baseDir)) return null;

  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      // Basic numeric sort for versions (e.g. 1.10.0 > 1.2.0)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

    return versions[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Checks if an error from fetchReleaseInfo is a "release not found" error vs a network error.
 */
function isReleaseNotFoundError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes("No release found for package");
}

/**
 * Attempts to use a locally cached version when network fetch fails.
 * Returns the fallback path if available, otherwise null.
 */
async function tryLocalFallback(
  version: string | undefined,
  error: unknown,
  baseDir: string,
  logPrefix: string,
): Promise<string | null> {
  // Only fallback for network errors, not "release not found" errors
  if (version || isReleaseNotFoundError(error)) {
    return null;
  }

  console.warn(`[Fetcher] ${logPrefix}: Network failed, looking for local fallback...`);
  const latestLocal = await findLatestLocalVersion(baseDir);
  if (latestLocal) {
    console.info(`[Fetcher] ${logPrefix}: Using locally cached version: ${latestLocal}`);
    return latestLocal;
  }
  console.warn(`[Fetcher] ${logPrefix}: No local fallback found`);
  return null;
}
