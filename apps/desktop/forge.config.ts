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
// package. Keep the runtime icons as well. The CLI is copied as an external
// resource, so it does not enter app.asar or bring workspace links with it.
const ignoreDesktopSource = (filePath: string) => {
  const file = filePath.replaceAll("\\", "/");
  const isViteBuild = file === "/.vite" || file.startsWith("/.vite/");
  const isRuntimeAssets =
    file === "/assets" || file === "/assets/build" || file.startsWith("/assets/build/");
  const isPackageManifest =
    (file === "package.json" || file.endsWith("/package.json")) &&
    !file.includes("/node_modules/") &&
    !file.includes("/dist/cli/");

  return !(isViteBuild || isRuntimeAssets || isPackageManifest);
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

async function stageBundledCli() {
  const source = path.join(__dirname, "../../apps/cli/dist");
  const target = path.join(__dirname, "dist/cli");

  await fs.rm(target, { recursive: true, force: true });
  await copyTreeWithoutSymlinks(source, target);

  const manifestPath = path.join(target, "package.json");
  const uiIndexPath = path.join(target, "ui/index.html");
  await fs.access(manifestPath);
  await fs.access(path.join(target, "index.mjs"));
  await fs.access(uiIndexPath);
  console.log(`[Forge Config] Staged bundled CLI and UI at ${target}`);
}

async function copyTreeWithoutSymlinks(source: string, target: string) {
  const sourceEntries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(target, { recursive: true });

  for (const entry of sourceEntries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Bundled CLI contains an unsupported symlink: ${sourcePath}`);
    }

    if (entry.isDirectory()) {
      await copyTreeWithoutSymlinks(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    } else {
      throw new Error(`Bundled CLI contains an unsupported filesystem entry: ${sourcePath}`);
    }
  }
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
    // The CLI is an external resource at resources/cli. Keep the desktop
    // runtime unpacked: Electron's Windows asar finalization exhausts the
    // runner's Node heap when it walks the workspace-installed dependency
    // graph, even though those links are ignored from the final app.
    derefSymlinks: true,
    appBundleId: bundleId,
    asar: false,
    ignore: ignoreDesktopSource,
    extraResource: [path.join(__dirname, "dist/cli")],
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
    prePackage: async () => {
      await stageBundledCli();
    },
    packageAfterCopy: async (_, buildPath) => {
      // Electron Packager may omit the source manifest when the app is
      // reduced to Vite output. The Vite plugin rewrites this file in the
      // same hook, so ensure its parent exists before that rewrite runs.
      await fs.mkdir(buildPath, { recursive: true });
      await fs.copyFile(path.join(__dirname, "package.json"), path.join(buildPath, "package.json"));
      await fs.cp(path.join(__dirname, ".vite"), path.join(buildPath, ".vite"), {
        recursive: true,
      });
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
