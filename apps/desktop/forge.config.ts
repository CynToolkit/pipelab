import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerPKG } from "@electron-forge/maker-pkg";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { name } from "@pipelab/constants";
import * as fs from "fs-extra";
import * as path from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {*} */
const config: ForgeConfig = {
  packagerConfig: {
    prune: false,
    appBundleId: "app.pipelab.desktop",
    asar: false,
    extraResource: [path.join(__dirname, "../cli/assets"), "bin"],
    name,
    icon: path.join(__dirname, "../cli/assets/build/icon"),
    extendInfo: {
      NSAppleEventsUsageDescription:
        "This app need to run commands through Terminal for specific tasks such as steamcmd.sh.",
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    osxSign: {
      strictVerify: false,
      identity: `Developer ID Application: Quentin Goinaud (${process.env.APPLE_TEAM_ID})`,
      optionsForFile: (filePath) => {
        return {
          "entitlements-inherit": path.join(
            __dirname,
            "../cli/assets/build/entitlements.mac.plist",
          ),
          entitlements: path.join(__dirname, "../cli/assets/build/entitlements.mac.plist"),
        };
      },
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name,
      setupIcon: path.join(__dirname, "../cli/assets/build/icon.ico"),
    }),
    new MakerZIP(undefined, ["linux", "win32"]),
    new MakerDMG(),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "CynToolkit",
          name: "pipelab",
        },
        prerelease: true,
        draft: false,
        generateReleaseNotes: true,
      },
    },
  ],
  hooks: {
    prePackage: async (forgeConfig, platform, arch) => {
      console.log("INFO: Running prePackage hook to copy CLI binaries...");
      const cliPath = path.resolve(__dirname, "../cli");

      try {
        const destBinDir = path.resolve(__dirname, "bin");
        await fs.ensureDir(destBinDir);

        const srcBinDir = path.join(cliPath, "bin");
        console.log(`INFO: Copying binaries from ${srcBinDir} to ${destBinDir}`);
        await fs.copy(srcBinDir, destBinDir, { overwrite: true });

        console.log("INFO: CLI binaries copied successfully.");
      } catch (err) {
        console.error("ERROR: Failed to copy CLI binaries:", err);
        throw err;
      }
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.mts",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.mts",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
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
