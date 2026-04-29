import { dirname, delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readdir, readFile, writeFile, access, chmod, rm, cp } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import pacote from "pacote";
import semver from "semver";
import { isDev, projectRoot, PipelabContext } from "../context";
import { execa } from "execa";
import { downloadFile, extractZip, extractTarGz, generateTempFolder } from "./fs-extras";

export type FetchOptions = {
  installDeps?: boolean;
  signal?: AbortSignal;
  context: PipelabContext;
};

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
  // 0. Check for local monorepo package in development
  if (isDev && projectRoot && process.env.PIPELAB_FORCE_NPM !== "true") {
    if (packageName.startsWith("@pipelab/")) {
      const local = await tryResolveMonorepoPackage(packageName);
      if (local) {
        console.log(`[Fetcher] ${packageName}: Resolved to local source at ${local.packageDir}`);
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

  console.log(`[Fetcher] Resolving ${packageName}@${versionOrRange || "latest"}...`);

  try {
    // 1. Resolve version/range using npm
    const packument = await pacote.packument(packageName);
    const versions = Object.keys(packument.versions);
    const range = versionOrRange || "latest";

    // Prioritize tags (like 'latest', 'beta', etc.) over semver ranges
    const foundVersion = packument["dist-tags"]?.[range] || semver.maxSatisfying(versions, range);

    if (!foundVersion) {
      throw new Error(`Package ${packageName}@${range} not found on npm (available tags: ${Object.keys(packument["dist-tags"] || {}).join(", ")})`);
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

  // 2. Resolve entry point from package.json for downloaded package
  let entryPoint: string | undefined;
  try {
    const pkgPath = join(packageDir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      const main = pkg.module || pkg.main || pkg.publishConfig?.module || pkg.publishConfig?.main;
      if (main) {
        entryPoint = join(packageDir, main);
      } else if (pkg.bin) {
        const binFile = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
        if (binFile) entryPoint = join(packageDir, binFile as string);
      }
    }
  } catch (e) {
    console.warn(`[Fetcher] ${packageName}: Failed to parse package.json for entry point resolution:`, e);
  }

  if (options?.installDeps) {
    await installDependencies(packageDir, packageName, options);
  }

  return { packageDir, resolvedVersion, entryPoint };
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
    args = ["install", "--prod", "--no-lockfile"],
    extraEnv = {},
    signal,
    context: ctx,
  } = options;

  const nodePath = await ensureNodeJS("24.14.1", { context: ctx }).catch(() => process.execPath);
  const pnpmPath = await ensurePNPM("10.12.0", { context: ctx }).catch(() => "pnpm");

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
      PNPM_HOME: join(ctx.userDataPath, "pnpm"),
      ...extraEnv,
    },
  });
}

/**
 * Installs a specific version of Node.js if not already present.
 */
export async function ensureNodeJS(version: string, options: { context: PipelabContext }) {
  const ctx = options.context;
  const nodeDir = ctx.getThirdPartyPath("node", version);
  const isWindows = process.platform === "win32";
  const executableName = isWindows ? "node.exe" : "bin/node";
  const finalNodePath = join(nodeDir, executableName);

  try {
    await access(finalNodePath, constants.X_OK);
    return finalNodePath;
  } catch (e) {}

  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "x86";
  const platform = isWindows ? "win" : process.platform === "darwin" ? "osx" : "linux";
  const extension = isWindows ? "zip" : "tar.gz";
  const downloadPlatform = platform === "osx" ? "darwin" : platform;

  const fileName = `node-v${version}-${downloadPlatform}-${arch}.${extension}`;
  const downloadUrl = `https://nodejs.org/dist/v${version}/${fileName}`;
  const tempDir = await generateTempFolder(tmpdir());
  const archivePath = join(tempDir, fileName);

  console.log(`Downloading Node.js from ${downloadUrl}...`);
  await downloadFile(downloadUrl, archivePath);

  console.log(`Extracting Node.js to ${tempDir}...`);
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
  await mkdir(dirname(nodeDir), { recursive: true });
  await rm(nodeDir, { recursive: true, force: true });
  await cp(sourceDir, nodeDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });

  if (!isWindows) await chmod(finalNodePath, 0o755).catch(() => {});
  return finalNodePath;
}

/**
 * Installs the PNPM package from npm if not already present.
 */
export async function ensurePNPM(version = "10.12.0", options: { context: PipelabContext }) {
  const ctx = options.context;
  const { packageDir } = await fetchPackage("pnpm", version, {
    context: ctx,
  });
  return join(packageDir, "bin", "pnpm.cjs");
}

async function installDependencies(packageDir: string, packageName: string, options: FetchOptions) {
  const nodeModulesPath = join(packageDir, "node_modules");

  if (existsSync(nodeModulesPath)) {
    try {
      const files = await readdir(nodeModulesPath);
      if (files.length === 0) {
        console.warn(`[Fetcher] ${packageName}: node_modules exists but is empty. Re-installing...`);
      }
    } catch (e) {
      // Continue to install if readdir fails
    }
  }

  console.log(`[Fetcher] ${packageName}: Ensuring dependencies are installed...`);
  try {
    const { all } = await runPnpm(packageDir, {
      signal: options.signal,
      context: options.context,
    });

    if (all) console.log(`[Fetcher] ${packageName}: Installation trace:\n${all}`);
    console.log(`[Fetcher] ${packageName}: Dependencies installed successfully.`);
  } catch (err: any) {
    console.error(
      `[Fetcher] ${packageName}: CRITICAL ERROR during dependency installation: ${err.message}`,
    );
    if (err.all) console.error(`[Fetcher] ${packageName}: Error details:\n${err.all}`);
    throw new Error(`Failed to install dependencies for ${packageName}. See logs for details.`);
  }
}

export async function fetchPipelabAsset(
  packageName: string,
  versionOrRange: string,
  options: FetchOptions,
): Promise<string> {
  if (isDev && projectRoot) {
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
    installDeps: true,
    ...options,
  });

  // Default entry point if not provided by fetchPackage
  let finalEntryPoint = entryPoint;
  if (!finalEntryPoint) {
    const patterns = [
      join(packageDir, "dist", "index.mjs"),
      join(packageDir, "index.mjs"),
    ];
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
    const patterns = [
      join(packageDir, "dist", "index.mjs"),
      join(packageDir, "index.mjs"),
    ];
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
