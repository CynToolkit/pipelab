import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { name } from "@pipelab/constants";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getStandardOs = (p: string) => ({ win32: "win", darwin: "macos", linux: "linux" })[p] || p;

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

const config: ForgeConfig = {
  packagerConfig: {
    prune: false,
    appBundleId: "app.pipelab.desktop",
    asar: true,
    extraResource: [],
    name,
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
    new MakerSquirrel({ name, setupIcon: path.join(__dirname, "assets/build/icon.ico") }),
    new MakerZIP(undefined, ["linux", "win32"]),
    new MakerDMG(),
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
