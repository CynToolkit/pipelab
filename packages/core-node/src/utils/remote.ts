import { dirname, delimiter, join } from "node:path";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  access,
  chmod,
  rm,
  cp,
  rename,
} from "node:fs/promises";
import { existsSync, constants, statSync, readdirSync } from "node:fs";
import dns from "node:dns/promises";
import pacote from "pacote";
import semver from "semver";
import { isDev, projectRoot, PipelabContext, CacheFolder } from "../context";
import { execa } from "execa";
import { sendStartupProgress } from "../server";
import { downloadFile, extractZip, extractTarGz } from "./fs-extras";

import { DEFAULT_NODE_VERSION, DEFAULT_PNPM_VERSION } from "@pipelab/constants";

function isPackageComplete(packageDir: string): boolean {
  return existsSync(join(packageDir, "package.json"));
}

function isNodeJSComplete(nodePath: string): boolean {
  try {
    return existsSync(nodePath) && statSync(nodePath).size > 0;
  } catch {
    return false;
  }
}

function isDependenciesInstalledSync(packageDir: string): boolean {
  const nodeModulesPath = join(packageDir, "node_modules");
  if (!existsSync(nodeModulesPath)) return false;
  try {
    const files = readdirSync(nodeModulesPath);
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * In-memory lock to prevent concurrent operations on the same resource (e.g., downloading Node.js).
 */
const activeOperations = new Map<string, Promise<any>>();
const packumentRequests = new Map<string, Promise<any>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = activeOperations.get(key);
  if (existing) {
    console.log(`[Lock] Waiting for concurrent operation on: ${key}`);
    return existing;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      activeOperations.delete(key);
    }
  })();

  activeOperations.set(key, promise);
  return promise;
}

let isOnlineCached: boolean | null = null;
let lastCheckTime = 0;

export async function isOnline(): Promise<boolean> {
  const now = Date.now();
  if (isOnlineCached !== null && now - lastCheckTime < 10000) {
    return isOnlineCached;
  }
  try {
    await Promise.race([
      dns.lookup("registry.npmjs.org"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    isOnlineCached = true;
  } catch {
    isOnlineCached = false;
  }
  lastCheckTime = now;
  return isOnlineCached;
}

export type FetchOptions = {
  installDeps?: boolean;
  signal?: AbortSignal;
  context: PipelabContext;
};

function allowPrereleaseInRange(rangeStr: string): string {
  try {
    const r = new semver.Range(rangeStr);
    return r.set
      .map((conj) =>
        conj
          .map((c) => {
            const v = c.semver;
            if (v.prerelease && v.prerelease.length) {
              return c.operator + v.format();
            }
            return c.operator + v.major + "." + v.minor + "." + v.patch + "-0";
          })
          .join(" "),
      )
      .join(" || ");
  } catch {
    return rangeStr;
  }
}

/**
 * Robust utility to fetch, cache, and resolve an NPM package.
 * Centralized in core-node to avoid circular dependencies.
 */
export async function fetchPackage(
  packageName: string,
  versionOrRange: string,
  options: FetchOptions,
): Promise<{
  packageDir: string;
  resolvedVersion: string;
  isLocal?: boolean;
  entryPoint?: string;
}> {
  const start = Date.now();
  // 0. Check for local monorepo package in development
  if (isDev && projectRoot && process.env.PIPELAB_FORCE_NPM !== "true") {
    if (packageName.startsWith("@pipelab/")) {
      const localStart = Date.now();
      const local = await tryResolveMonorepoPackage(packageName);
      if (local) {
        console.debug(`[Fetcher] ${packageName}: Resolved to local source at ${local.packageDir} (${Date.now() - localStart}ms)`,
        );
        return {
          ...local,
          resolvedVersion: "workspace",
        };
      }
    }
  }

  const ctx = options.context;
  const baseDir = ctx.getPackagesPath(packageName);
  let resolvedVersion: string;
  const includePrerelease = !!(ctx.releaseTag && ctx.releaseTag !== "latest");

  let resolvedVersionOrRange = versionOrRange;
  if (resolvedVersionOrRange === "local") {
    resolvedVersionOrRange = "latest";
  }

  console.debug(`[Fetcher] Resolving ${packageName}@${resolvedVersionOrRange || "latest"}...`);
  const resolveStart = Date.now();

  const online = await isOnline();
  if (!online) {
    console.warn(
      `[Fetcher] ${packageName}: offline mode detected (${Date.now() - resolveStart}ms), trying local fallback...`,
    );
    const fallbackStart = Date.now();
    const fallbackVersion = await tryLocalFallback(
      resolvedVersionOrRange,
      new Error("Offline"),
      baseDir,
      packageName,
      includePrerelease,
    );
    if (fallbackVersion) {
      resolvedVersion = fallbackVersion;
      console.debug(`[Fetcher] ${packageName}: Resolved to local fallback ${resolvedVersion} (${Date.now() - fallbackStart}ms)`,
      );
    } else {
      throw new Error(`Offline and no local fallback version available for ${packageName}`);
    }
  } else {
    try {
      // 1. Resolve version/range using npm with session-wide memoization and disk cache
      const cachePath = ctx.getCachePath(CacheFolder.Pacote);
      let packumentPromise = packumentRequests.get(packageName);
      if (!packumentPromise) {
        packumentPromise = pacote.packument(packageName, { cache: cachePath });
        packumentRequests.set(packageName, packumentPromise);
      }

      const packument = await packumentPromise;
      const versions = Object.keys(packument.versions);
      const range = resolvedVersionOrRange || "latest";

      // Prioritize tags (like 'latest', 'beta', etc.) over semver ranges
      let foundVersion =
        packument["dist-tags"]?.[range] ||
        semver.maxSatisfying(versions, range, { includePrerelease });

      // If we are in a non-latest releaseTag channel (like "beta" or "dev"),
      // and we are resolving a range, we can prefer the releaseTag version if it exists
      // and satisfies the range (ignoring strict prerelease constraints if includePrerelease is true).
      if (!foundVersion && ctx.releaseTag && ctx.releaseTag !== "latest") {
        const releaseTagVersion = packument["dist-tags"]?.[ctx.releaseTag];
        if (releaseTagVersion && semver.valid(releaseTagVersion)) {
          const rewrittenRangeForCheck = allowPrereleaseInRange(range);
          if (
            semver.satisfies(releaseTagVersion, rewrittenRangeForCheck, { includePrerelease: true })
          ) {
            console.debug(`[Fetcher] Using release tag "${ctx.releaseTag}" (${releaseTagVersion}) for ${packageName}@${range} because it satisfies the range`,
            );
            foundVersion = releaseTagVersion;
          }
        }
      }

      // If we still don't have a version, and includePrerelease is true, try rewriting the range to allow prerelease matching
      if (!foundVersion && includePrerelease) {
        const rewrittenRange = allowPrereleaseInRange(range);
        if (rewrittenRange !== range) {
          const matched = semver.maxSatisfying(versions, rewrittenRange, { includePrerelease });
          if (matched) {
            console.debug(`[Fetcher] Resolved ${packageName}@${range} to ${matched} via rewritten range ${rewrittenRange}`,
            );
            foundVersion = matched;
          }
        }
      }

      // If we are in a non-latest releaseTag channel (like "beta" or "dev"),
      // and we are resolving "latest", we prefer the releaseTag version if it exists
      // and is newer than (or equal to) the latest stable version.
      if (range === "latest" && ctx.releaseTag && ctx.releaseTag !== "latest") {
        const releaseTagVersion = packument["dist-tags"]?.[ctx.releaseTag];
        if (releaseTagVersion && semver.valid(releaseTagVersion)) {
          if (
            !foundVersion ||
            (semver.valid(foundVersion) && semver.gte(releaseTagVersion, foundVersion))
          ) {
            console.debug(`[Fetcher] Using release tag "${ctx.releaseTag}" (${releaseTagVersion}) instead of "latest" (${foundVersion || "none"}) for ${packageName}`,
            );
            foundVersion = releaseTagVersion;
          } else if (foundVersion) {
            console.warn(
              `[Fetcher] Tag "${ctx.releaseTag}" (${releaseTagVersion}) is older than "latest" (${foundVersion}) for ${packageName}, keeping "latest"`,
            );
          }
        }
      }

      if (!foundVersion) {
        throw new Error(
          `Package ${packageName}@${range} not found on npm (available tags: ${Object.keys(packument["dist-tags"] || {}).join(", ")})`,
        );
      }
      resolvedVersion = foundVersion;
      console.debug(`[Fetcher] ${packageName}: Resolved to v${resolvedVersion} via npm (${Date.now() - resolveStart}ms)`,
      );
    } catch (error) {
      console.warn(
        `[Fetcher] ${packageName}: remote resolution failed (${Date.now() - resolveStart}ms), trying local fallback...`,
      );
      const fallbackStart = Date.now();
      const fallbackVersion = await tryLocalFallback(
        resolvedVersionOrRange,
        error,
        baseDir,
        packageName,
        includePrerelease,
      );
      if (fallbackVersion) {
        resolvedVersion = fallbackVersion;
        console.debug(`[Fetcher] ${packageName}: Resolved to local fallback ${resolvedVersion} (${Date.now() - fallbackStart}ms)`,
        );
      } else {
        throw error;
      }
    }
  }

  const cachePath = ctx.getCachePath(CacheFolder.Pacote);
  const packageDir = join(baseDir, resolvedVersion);

  const checkStart = Date.now();
  // If the package already exists and we don't need to install dependencies (or they are already installed), return immediately
  const isInstalled = options?.installDeps
    ? isPackageComplete(packageDir) && isDependenciesInstalledSync(packageDir)
    : isPackageComplete(packageDir);
  const checkDuration = Date.now() - checkStart;

  if (isInstalled) {
    console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: Already installed (check took ${checkDuration}ms, fetchPackage took ${Date.now() - start}ms)`,
    );
    return { packageDir, resolvedVersion };
  }

  const lockKey = `package:${packageName}:${resolvedVersion}`;
  return withLock(lockKey, async () => {
    if (!isPackageComplete(packageDir)) {
      console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: Downloading to ${packageDir}...`);
      const downloadStart = Date.now();

      const tempDir = join(
        baseDir,
        `.tmp-${resolvedVersion}-${Math.random().toString(36).slice(2)}`,
      );
      await mkdir(tempDir, { recursive: true });
      try {
        await pacote.extract(`${packageName}@${resolvedVersion}`, tempDir, {
          cache: cachePath,
        });

        // Resolve entryPoint from package.json inside the temp directory first to ensure everything works
        await resolveEntryPoint(tempDir, packageName);

        // Remove existing incomplete packageDir if any
        if (existsSync(packageDir)) {
          await rm(packageDir, { recursive: true, force: true }).catch(() => {});
        }

        // Atomically rename the temp directory to the target packageDir
        try {
          await rename(tempDir, packageDir);
        } catch (err: any) {
          if (isPackageComplete(packageDir)) {
            console.debug(`[Fetcher] Destination ${packageDir} already exists and is valid.`);
          } else {
            throw err;
          }
        }
        console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: Downloaded and extracted in ${Date.now() - downloadStart}ms`,
        );
      } catch (err) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw err;
      }
    }

    // 2. Resolve entry point from package.json for downloaded package
    const entryStart = Date.now();
    const entryPoint = await resolveEntryPoint(packageDir, packageName);
    console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: Resolved entry point in ${Date.now() - entryStart}ms`,
    );

    if (options?.installDeps) {
      const depsStart = Date.now();
      await installDependencies(packageDir, packageName, options);
      console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: Installed dependencies in ${Date.now() - depsStart}ms`,
      );
    }

    console.debug(`[Fetcher] ${packageName}@${resolvedVersion}: FetchPackage complete in ${Date.now() - start}ms`,
    );
    return { packageDir, resolvedVersion, entryPoint };
  });
}

/**
 * Executes a pnpm install in a specific directory with a portable environment.
 */
export async function runPnpm(
  cwd: string,
  options: {
    args?: string[];
    extraEnv?: Record<string, string>;
    signal?: AbortSignal;
    context: PipelabContext;
  },
) {
  const {
    args = [
      "install",
      "--prod",
      "--no-lockfile",
      "--prefer-offline",
      "--no-verify-store-integrity",
    ],
    extraEnv = {},
    signal,
    context: ctx,
  } = options;

  const [nodePath, pnpmPath] = await Promise.all([
    ensureNodeJS(ctx).catch(() => process.execPath),
    ensurePNPM(ctx).catch(() => "pnpm"),
  ]);

  const isScript = pnpmPath.endsWith(".cjs") || pnpmPath.endsWith(".js");
  const command = isScript ? nodePath : pnpmPath;
  const finalArgs = isScript ? [pnpmPath, ...args] : args;

  return execa(command, finalArgs, {
    cwd,
    all: true,
    cancelSignal: signal,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PATH: nodePath ? `${dirname(nodePath)}${delimiter}${process.env.PATH}` : process.env.PATH,
      PNPM_HOME: ctx.getPnpmPath(),
      PNPM_ONLY_ALLOW_TRUSTED_DEPENDENCIES: "false",
      ...extraEnv,
    },
  });
}

/**
 * Installs a specific version of Node.js if not already present.
 */
export async function ensureNodeJS(context: PipelabContext, version = DEFAULT_NODE_VERSION) {
  const checkStart = Date.now();
  const isWindows = process.platform === "win32";
  const nodeDir = context.getThirdPartyPath("node", version);
  const finalNodePath = join(nodeDir, isWindows ? "node.exe" : "bin/node");

  if (isNodeJSComplete(finalNodePath)) {
    console.debug(`[Environment] Node.js check took ${Date.now() - checkStart}ms (found at ${finalNodePath})`,
    );
    return finalNodePath;
  }

  const lockKey = `node:${version}`;
  return withLock(lockKey, async () => {
    if (isNodeJSComplete(finalNodePath)) return finalNodePath;

    const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "x86";
    const platform = isWindows ? "win" : process.platform === "darwin" ? "osx" : "linux";
    const extension = isWindows ? "zip" : "tar.gz";
    const downloadPlatform = platform === "osx" ? "darwin" : platform;

    const fileName = `node-v${version}-${downloadPlatform}-${arch}.${extension}`;
    const downloadUrl = `https://nodejs.org/dist/v${version}/${fileName}`;
    const tempDir = await context.createTempFolder("node-download-");
    const archivePath = join(tempDir, fileName);

    sendStartupProgress(`Downloading Node.js v${version}...`);
    console.log(`Downloading Node.js from ${downloadUrl}...`);
    const dlStart = Date.now();
    await downloadFile(downloadUrl, archivePath);
    console.debug(`[Environment] Node.js download took ${Date.now() - dlStart}ms`);

    sendStartupProgress(`Extracting Node.js v${version}...`);
    console.log(`Extracting Node.js to ${tempDir}...`);
    const extStart = Date.now();
    const extractTempDir = join(tempDir, "extracted");
    await mkdir(extractTempDir, { recursive: true });

    if (extension === "zip") {
      await extractZip(archivePath, extractTempDir);
    } else {
      await extractTarGz(archivePath, extractTempDir);
    }

    const extractedEntries = await readdir(extractTempDir);
    const nodeSubDir = extractedEntries.find((entry) => entry.startsWith(`node-v${version}`));
    if (!nodeSubDir) throw new Error(`Could not find extracted Node.js directory`);

    const sourceDir = join(extractTempDir, nodeSubDir);
    const parentDir = dirname(nodeDir);
    await mkdir(parentDir, { recursive: true });

    const tempNodeDir = join(
      parentDir,
      `.tmp-node-${version}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempNodeDir, { recursive: true });

    try {
      await cp(sourceDir, tempNodeDir, { recursive: true });
      if (!isWindows) {
        const tempNodePath = join(tempNodeDir, "bin/node");
        await chmod(tempNodePath, 0o755).catch(() => {});
      }

      if (existsSync(nodeDir)) {
        await rm(nodeDir, { recursive: true, force: true }).catch(() => {});
      }

      try {
        await rename(tempNodeDir, nodeDir);
      } catch (err: any) {
        if (isNodeJSComplete(finalNodePath)) {
          console.debug(`[Fetcher] Node.js directory already exists and is valid.`);
        } else {
          throw err;
        }
      }
      console.debug(`[Environment] Node.js extraction took ${Date.now() - extStart}ms`);
    } finally {
      await rm(tempNodeDir, { recursive: true, force: true }).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    console.debug(`[Environment] Node.js set up complete in ${Date.now() - checkStart}ms`);
    return finalNodePath;
  });
}

/**
 * Installs the PNPM package from npm if not already present.
 */
export async function ensurePNPM(context: PipelabContext, version = DEFAULT_PNPM_VERSION) {
  const checkStart = Date.now();
  const pnpmDir = context.getPackagesPath("pnpm", version);
  const pnpmPath = join(pnpmDir, "bin", "pnpm.cjs");

  if (existsSync(pnpmPath)) {
    console.debug(`[Environment] PNPM check took ${Date.now() - checkStart}ms (found at ${pnpmPath})`,
    );
    return pnpmPath;
  }

  const lockKey = `pnpm:${version}`;
  return withLock(lockKey, async () => {
    if (existsSync(pnpmPath)) return pnpmPath;
    sendStartupProgress(`Checking PNPM v${version}...`);
    const { packageDir } = await fetchPackage("pnpm", version, {
      context,
    });
    console.debug(`[Environment] PNPM set up complete in ${Date.now() - checkStart}ms`);
    return join(packageDir, "bin", "pnpm.cjs");
  });
}

async function installDependencies(packageDir: string, packageName: string, options: FetchOptions) {
  const start = Date.now();
  const nodeModulesPath = join(packageDir, "node_modules");

  if (isDependenciesInstalledSync(packageDir)) {
    console.debug(`[Fetcher] ${packageName}: Dependencies already installed, skipping.`);
    return;
  }

  try {
    console.debug(`[Fetcher] ${packageName}: Ensuring dependencies are installed...`);
    const pnpmStart = Date.now();
    const { all } = await runPnpm(packageDir, {
      signal: options.signal,
      context: options.context,
    });
    console.debug(`[Fetcher] ${packageName}: pnpm install command took ${Date.now() - pnpmStart}ms`);

    if (all) console.debug(`[Fetcher] ${packageName}: Installation trace:\n${all}`);

    console.debug(`[Fetcher] ${packageName}: Dependencies installed successfully (total installDependencies took ${Date.now() - start}ms).`,
    );
  } catch (err: any) {
    console.error(
      `[Fetcher] ${packageName}: CRITICAL ERROR during dependency installation: ${err.message}`,
    );
    if (err.all) console.error(`[Fetcher] ${packageName}: Error details:\n${err.all}`);
    // Clean up node_modules on error to allow retries
    await rm(nodeModulesPath, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Failed to install dependencies for ${packageName}. See logs for details.`);
  }
}

export async function fetchPipelabAsset(
  packageName: string,
  versionOrRange: string,
  options: FetchOptions,
): Promise<string> {
  // Prefer the local monorepo asset when it exists (dev workflow). This avoids
  // pulling a published template that may pin Tauri crate versions inconsistently
  // with what the local scaffold expects. `PIPELAB_FORCE_NPM` can still force the
  // published package (used by CI/prod).
  if (projectRoot && process.env.PIPELAB_FORCE_NPM !== "true") {
    const assetId = packageName.replace("@pipelab/asset-", "");
    const localPath = join(projectRoot, "assets", `asset-${assetId}`);
    if (existsSync(localPath)) return localPath;
  }
  const { packageDir } = await fetchPackage(packageName, versionOrRange, options);
  return packageDir;
}

export async function fetchPipelabPlugin(
  pluginName: string,
  versionOrRange: string,
  options: FetchOptions,
): Promise<{ packageDir: string; entryPoint: string; isLocal: boolean }> {
  const { packageDir, isLocal, entryPoint } = await fetchPackage(pluginName, versionOrRange, {
    installDeps: false,
    ...options,
  });

  // Default entry point if not provided by fetchPackage
  let finalEntryPoint = entryPoint;
  if (!finalEntryPoint) {
    const patterns = [join(packageDir, "dist", "index.mjs"), join(packageDir, "index.mjs")];
    finalEntryPoint = patterns.find((p) => existsSync(p)) || patterns[0];
  }

  return { packageDir, entryPoint: finalEntryPoint, isLocal: !!isLocal };
}

export async function fetchPipelabCli(
  versionOrRange: string,
  options: FetchOptions,
): Promise<{ packageDir: string; entryPoint: string; isLocal: boolean }> {
  const { packageDir, isLocal, entryPoint } = await fetchPackage(
    "@pipelab/cli",
    versionOrRange,
    options,
  );

  // Default entry point for CLI if not provided
  let finalEntryPoint = entryPoint;
  if (!finalEntryPoint) {
    const patterns = [join(packageDir, "dist", "index.mjs"), join(packageDir, "index.mjs")];
    finalEntryPoint = patterns.find((p) => existsSync(p)) || patterns[0];
  }

  return { packageDir, entryPoint: finalEntryPoint, isLocal: !!isLocal };
}

/**
 * Cache for monorepo package locations to avoid repeated disk crawling.
 */
let monorepoCache: Record<string, string> | null = null;

async function tryResolveMonorepoPackage(
  packageName: string,
): Promise<{ packageDir: string; isLocal: boolean; entryPoint: string } | null> {
  if (!monorepoCache) {
    monorepoCache = await crawlMonorepoPackages();
  }

  const packageDir = monorepoCache[packageName];
  if (!packageDir) return null;

  // Find best entry point from package.json
  let entryPoint: string | undefined;
  try {
    const pkgPath = join(packageDir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

    // 1. Try to find the entry point from package.json
    // User tip: main is usually source in dev, publishConfig.main is compiled for prod
    const publishMain = pkg.publishConfig?.module || pkg.publishConfig?.main;
    const devMain = pkg.module || pkg.main;

    // Check bin field if it's a CLI
    const binField =
      typeof pkg.bin === "string"
        ? pkg.bin
        : pkg.bin?.[packageName.replace("@pipelab/", "")] ||
          (pkg.bin ? pkg.bin[Object.keys(pkg.bin)[0]] : undefined);

    // In dev, we prefer the "main" field if it points to TS, or a hardcoded src/index.ts
    const tsSource = join(packageDir, "src", "index.ts");

    if (devMain && devMain.endsWith(".ts")) {
      entryPoint = join(packageDir, devMain);
    } else if (existsSync(tsSource)) {
      entryPoint = tsSource;
    } else if (binField) {
      entryPoint = join(packageDir, binField);
    } else if (publishMain) {
      entryPoint = join(packageDir, publishMain);
    } else if (devMain) {
      entryPoint = join(packageDir, devMain);
    }
  } catch (e) {
    console.warn(`[Fetcher] Failed to parse package.json for ${packageName}:`, e);
  }

  return {
    packageDir,
    isLocal: true,
    entryPoint: entryPoint || join(packageDir, "dist", "index.mjs"),
  };
}

async function crawlMonorepoPackages(): Promise<Record<string, string>> {
  const cache: Record<string, string> = {};
  if (!projectRoot) return cache;

  const searchDirs = ["plugins", "packages", "apps"];
  for (const dir of searchDirs) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;

    try {
      const entries = await readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = join(fullDir, entry.name, "package.json");
          if (existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
              if (pkg.name) {
                cache[pkg.name] = join(fullDir, entry.name);
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
  return cache;
}

async function tryLocalFallback(
  versionOrRange: string | undefined,
  _error: unknown,
  baseDir: string,
  logPrefix: string,
  includePrerelease = false,
): Promise<string | null> {
  if (!existsSync(baseDir)) return null;
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const localVersions = entries
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      .filter((name) => !!semver.valid(name));

    if (localVersions.length === 0) return null;

    const range = versionOrRange || "latest";

    if (range === "latest") {
      const sorted = localVersions.sort((a, b) => semver.rcompare(a, b));
      const latestLocal = sorted[0] || null;
      if (latestLocal) {
        console.info(`[Fetcher] ${logPrefix}: Using locally cached latest version: ${latestLocal}`);
        return latestLocal;
      }
    } else {
      const matched = semver.maxSatisfying(localVersions, range, { includePrerelease });
      if (matched) {
        console.info(
          `[Fetcher] ${logPrefix}: Using locally cached matching version: ${matched} for range ${range}`,
        );
        return matched;
      }
    }
  } catch (e) {
    console.warn(`[Fetcher] ${logPrefix}: Error during local fallback resolution:`, e);
  }
  return null;
}

/**
 * Resolves the entry point of a package by looking at its package.json.
 */
async function resolveEntryPoint(packageDir: string, packageName: string) {
  try {
    const pkgPath = join(packageDir, "package.json");
    if (!existsSync(pkgPath)) return undefined;

    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const main = pkg.module || pkg.main || pkg.publishConfig?.module || pkg.publishConfig?.main;

    if (main) {
      return join(packageDir, main);
    }

    if (pkg.bin) {
      const binFile = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
      if (binFile) return join(packageDir, binFile as string);
    }
  } catch (e) {
    console.warn(`[Fetcher] ${packageName}: Failed to resolve entry point:`, e);
  }
  return undefined;
}
