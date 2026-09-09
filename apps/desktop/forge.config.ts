import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`[Forge Config] Host arch: ${process.arch}`);
console.log(`[Forge Config] Target arch (env.TARGET_ARCH): ${process.env.TARGET_ARCH}`);
console.log(`[Forge Config] npm_config_arch: ${process.env.npm_config_arch}`);

const getStandardOs = (p: string) => ({ win32: "win", darwin: "macos", linux: "linux" })[p] || p;

// The Vite plugin normally keeps only its generated `.vite` output in the
// package. Keep the runtime icons; the CLI is staged into the copied app by
// the packageAfterCopy hook, avoiding Packager's extraResource copy.
const ignoreDesktopSource = (filePath: string) => {
  // Forge passes an absolute path here. Resolve it before comparing so the
  // filter behaves identically on POSIX and Windows. In particular, never
  // allow Packager to walk workspace-linked node_modules: Windows junctions
  // can turn that walk into a very large/repeated traversal.
  const relativeFile = path
    .relative(__dirname, path.resolve(filePath))
    .replaceAll("\\", "/");

  // `.vite` is copied explicitly below with copyTreeWithoutSymlinks after
  // Packager has finished. Ignoring it here prevents Packager from walking it
  // once and then making us walk it again.
  return relativeFile !== "package.json";
};

/**
 * Renames Forge-generated installers in /out/make.
 */
async function renameInstallers(platform: string, arch: string) {
  const pkgPath = path.join(__dirname, "package.json");
  const { version } = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  const os = getStandardOs(platform);
  const makeDir = path.join(__dirname, "out/make");

  const exists = await fs
    .access(makeDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const files = await fs.readdir(makeDir, { recursive: true });

  for (const relFile of files) {
    const file = path.join(makeDir, relFile);
    if ((await fs.stat(file)).isDirectory()) continue;

    const ext = path.extname(file);
    const basename = path.basename(file);
    if ([".zip", ".dmg", ".exe", ".deb", ".rpm"].includes(ext) && !basename.includes("-v")) {
      const newName = `pipelab-desktop-v${version}-${os}-${arch}${ext}`;
      await fs.rename(file, path.join(path.dirname(file), newName));
    }
  }
}

async function stageBundledCli(target: string) {
  const source = path.join(__dirname, "../../apps/cli/dist");

  await fs.rm(target, { recursive: true, force: true });
  const staged = await copyTreeWithoutSymlinks(source, target);

  await verifyBundledCliLayout(target);
  console.log(
    `[Forge Config] Staged bundled CLI and UI at ${target} ` +
      `(${staged.fileCount} files, ${staged.directoryCount} directories, ${staged.byteCount} bytes)`,
  );
}

async function verifyBundledCliLayout(cliPath: string) {
  await Promise.all([
    fs.access(path.join(cliPath, "package.json")),
    fs.access(path.join(cliPath, "index.mjs")),
    fs.access(path.join(cliPath, "ui/index.html")),
  ]);
}

interface StagedTreeMetrics {
  fileCount: number;
  directoryCount: number;
  byteCount: number;
}

async function copyTreeWithoutSymlinks(
  source: string,
  target: string,
): Promise<StagedTreeMetrics> {
  const sourceEntries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(target, { recursive: true });
  const metrics: StagedTreeMetrics = { fileCount: 0, directoryCount: 1, byteCount: 0 };

  for (const entry of sourceEntries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const sourceStats = await fs.lstat(sourcePath);

    // On Windows, junctions can be reported as directories by Dirent. lstat
    // is required here or recursive copying will follow the workspace graph.
    if (sourceStats.isSymbolicLink()) {
      throw new Error(`Bundled CLI contains an unsupported symlink: ${sourcePath}`);
    }

    if (sourceStats.isDirectory()) {
      const childMetrics = await copyTreeWithoutSymlinks(sourcePath, targetPath);
      metrics.fileCount += childMetrics.fileCount;
      metrics.directoryCount += childMetrics.directoryCount;
      metrics.byteCount += childMetrics.byteCount;
    } else if (sourceStats.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
      metrics.fileCount += 1;
      metrics.byteCount += sourceStats.size;
    } else {
      throw new Error(`Bundled CLI contains an unsupported filesystem entry: ${sourcePath}`);
    }
  }

  return metrics;
}

import { getAppBundleId, getProductName } from "@pipelab/constants";
import { version } from "./package.json";

const productName = getProductName(version);
const bundleId = getAppBundleId(version);

const config: ForgeConfig = {
  packagerConfig: {
    // @ts-expect-error - Force architecture as Forge CLI sometimes ignores --arch flag in CI
    arch: process.env.TARGET_ARCH || process.env.npm_config_arch || process.arch,
    prune: false,
    // The CLI is staged under the unpacked desktop app at resources/app/dist/cli.
    // Keeping the app unpacked makes the CLI directly extractable and avoids
    // Electron Packager's Windows recursive extraResource copy.
    appBundleId: bundleId,
    asar: false,
    ignore: ignoreDesktopSource,
    name: productName,
    icon: path.join(__dirname, "assets/build/icon"),
    extendInfo: {
      NSAppleEventsUsageDescription: "This app need to run commands through Terminal.",
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID || "",
      appleIdPassword: process.env.APPLE_ID_PASSWORD || "",
      teamId: process.env.APPLE_TEAM_ID || "",
    },
    osxSign: {
      identity: `Developer ID Application: Quentin Goinaud (${process.env.APPLE_TEAM_ID})`,
      hardenedRuntime: true,
      entitlements: path.join(__dirname, "assets/build/entitlements.mac.plist"),
      "entitlements-inherit": path.join(__dirname, "assets/build/entitlements.mac.plist"),
      strictVerify: false,
    } as any,
  },
  makers: [
    new MakerSquirrel({
      name: productName,
      setupIcon: path.join(__dirname, "assets/build/icon.ico"),
    }),
    new MakerZIP(undefined, ["linux", "win32"]),
    new MakerDMG({ name: productName }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "CynToolkit", name: "pipelab" },
        prerelease: process.env.PRERELEASE === "true",
        draft: false,
        generateReleaseNotes: true,
      },
    },
  ],
  hooks: {
    packageAfterCopy: async (_, buildPath) => {
      // Electron Packager may omit the source manifest when the app is
      // reduced to Vite output. The Vite plugin rewrites this file in the
      // same hook, so ensure its parent exists before that rewrite runs.
      await fs.mkdir(buildPath, { recursive: true });
      await fs.copyFile(path.join(__dirname, "package.json"), path.join(buildPath, "package.json"));
      await copyTreeWithoutSymlinks(path.join(__dirname, ".vite"), path.join(buildPath, ".vite"));
      await stageBundledCli(path.join(buildPath, "dist/cli"));
    },
    postMake: async (_, makeResults) => {
      for (const target of new Set(makeResults.map((r) => `${r.platform}:${r.arch}`))) {
        const [p, a] = target.split(":");
        await renameInstallers(p, a);
      }
      return makeResults;
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.mts" },
        { entry: "src/preload.ts", config: "vite.preload.config.mts" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.mts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
