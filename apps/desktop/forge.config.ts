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
import { getAppBundleId, getProductName } from "@pipelab/constants";
import { version } from "./package.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[Forge Config] Host arch: " + process.arch);
console.log("[Forge Config] Target arch (env.TARGET_ARCH): " + process.env.TARGET_ARCH);
console.log("[Forge Config] npm_config_arch: " + process.env.npm_config_arch);

const getStandardOs = (platform: string) =>
  ({ win32: "win", darwin: "macos", linux: "linux" })[platform] || platform;

const packagedSourceRoots = ["/.vite", "/dist/cli", "/assets/build"];
const packagedSourceFiles = ["/package.json"];

// Electron Packager supplies a normalized source-relative path beginning with
// "/". Keep only the built runtime and never traverse the deploy node_modules.
const ignoreDesktopSource = (filePath: string) => {
  if (!filePath) return false;

  let normalized = filePath.replaceAll("\\", "/");
  const sourceRoot = __dirname.replaceAll("\\", "/");
  if (normalized === sourceRoot || normalized.startsWith(sourceRoot + "/")) {
    normalized = "/" + path.relative(__dirname, filePath).replaceAll("\\", "/");
  } else if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }

  if (normalized === "/") return false;

  const allowed = packagedSourceFiles.concat(packagedSourceRoots);
  return !allowed.some(
    (root) =>
      normalized === root ||
      normalized.startsWith(root + "/") ||
      root.startsWith(normalized + "/"),
  );
};

async function verifyPackagedLayout(buildPath: string) {
  const cliPath = path.join(buildPath, "dist/cli");
  await Promise.all([
    fs.access(path.join(buildPath, ".vite/build/main.js")),
    fs.access(path.join(cliPath, "package.json")),
    fs.access(path.join(cliPath, "index.mjs")),
    fs.access(path.join(cliPath, "ui/index.html")),
  ]);
}

async function renameInstallers(platform: string, arch: string) {
  const pkgPath = path.join(__dirname, "package.json");
  const packageJson = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  const makeDir = path.join(__dirname, "out/make");
  const exists = await fs
    .access(makeDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const os = getStandardOs(platform);
  const files = await fs.readdir(makeDir, { recursive: true });
  for (const relativeFile of files) {
    const file = path.join(makeDir, relativeFile);
    if ((await fs.stat(file)).isDirectory()) continue;

    const extension = path.extname(file);
    const basename = path.basename(file);
    if (
      [".zip", ".dmg", ".exe", ".deb", ".rpm"].includes(extension) &&
      !basename.includes("-v")
    ) {
      const renamed =
        "pipelab-desktop-v" +
        packageJson.version +
        "-" +
        os +
        "-" +
        arch +
        extension;
      await fs.rename(file, path.join(path.dirname(file), renamed));
    }
  }
}

const productName = getProductName(version);
const bundleId = getAppBundleId(version);

const config: ForgeConfig = {
  outDir: path.resolve(__dirname, "../out"),
  packagerConfig: {
    // @ts-expect-error - Force architecture as Forge CLI sometimes ignores --arch flag in CI
    arch: process.env.TARGET_ARCH || process.env.npm_config_arch || process.arch,
    prune: false,
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
      identity:
        "Developer ID Application: Quentin Goinaud (" +
        (process.env.APPLE_TEAM_ID || "") +
        ")",
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
      await verifyPackagedLayout(buildPath);
    },
    postMake: async (_, makeResults) => {
      for (const target of new Set(
        makeResults.map((result) => result.platform + ":" + result.arch),
      )) {
        const [platform, arch] = target.split(":");
        await renameInstallers(platform, arch);
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
