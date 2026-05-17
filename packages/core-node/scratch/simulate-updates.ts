import pacote from "pacote";
import semver from "semver";
import { fetchLatestDesktopRelease } from "../src/utils/github.js";

const PACKAGES = [
  // Apps & Core
  "@pipelab/cli",
  "@pipelab/ui",
  "@pipelab/shared",
  "@pipelab/core-node",
  "@pipelab/constants",
  "@pipelab/migration",

  // Plugins
  "@pipelab/plugin-construct",
  "@pipelab/plugin-core",
  "@pipelab/plugin-discord",
  "@pipelab/plugin-electron",
  "@pipelab/plugin-filesystem",
  "@pipelab/plugin-itch",
  "@pipelab/plugin-minify",
  "@pipelab/plugin-netlify",
  "@pipelab/plugin-nvpatch",
  "@pipelab/plugin-poki",
  "@pipelab/plugin-steam",
  "@pipelab/plugin-system",
  "@pipelab/plugin-tauri",

  // Assets
  "@pipelab/asset-discord",
  "@pipelab/asset-electron",
  "@pipelab/asset-netlify",
  "@pipelab/asset-tauri"
];

async function simulate() {
  console.log("==========================================");
  console.log("     PIPELAB UPDATE FLOW SIMULATOR        ");
  console.log("==========================================\n");

  // 1. Simulate Desktop GitHub Release Update
  console.log("--- 1. Simulating Desktop Application (GitHub Releases) ---");
  try {
    const stableApp = await fetchLatestDesktopRelease({ allowPrerelease: false });
    const betaApp = await fetchLatestDesktopRelease({ allowPrerelease: true });

    console.log(`[STABLE] Resolved version: ${stableApp ? stableApp.tag_name : "None (Stable users protected)"}`);
    console.log(`[BETA]   Resolved version: ${betaApp ? betaApp.tag_name : "None"}`);
  } catch (error) {
    console.error("Failed to fetch desktop releases from GitHub:", error);
  }

  console.log("\n--- 2. Simulating NPM Packages (CLI, UI, Plugins, Assets) ---");
  console.log("Fetching data from NPM registry. Please wait...\n");

  const results: Array<{
    package: string;
    stable: string;
    beta: string;
    notes: string;
  }> = [];

  for (const pkg of PACKAGES) {
    try {
      const packument = await pacote.packument(pkg);
      const stableVersion = packument["dist-tags"]?.latest || "N/A";
      const betaVersion = packument["dist-tags"]?.beta || "N/A";

      let notes = "";
      if (stableVersion === "N/A" && betaVersion === "N/A") {
        notes = "⚠️ Package not published on NPM";
      } else if (betaVersion !== "N/A" && stableVersion !== "N/A") {
        if (betaVersion === stableVersion) {
          notes = "Stable and Beta are in sync";
        } else {
          // Attempt semver comparison
          const cleanStable = semver.coerce(stableVersion);
          const cleanBeta = semver.coerce(betaVersion);
          if (cleanStable && cleanBeta) {
            const comp = semver.compare(stableVersion, betaVersion);
            if (comp < 0) {
              notes = "🚀 Beta is ahead";
            } else if (comp > 0) {
              notes = "Stable is ahead";
            } else {
              notes = "Stable and Beta are in sync (coerced)";
            }
          } else {
            notes = "Different versions (non-semver)";
          }
        }
      } else if (betaVersion !== "N/A" && stableVersion === "N/A") {
        notes = "Only Beta version exists";
      } else if (stableVersion !== "N/A" && betaVersion === "N/A") {
        notes = "No Beta tag published";
      }

      results.push({
        package: pkg,
        stable: stableVersion,
        beta: betaVersion,
        notes
      });
    } catch (error: any) {
      results.push({
        package: pkg,
        stable: "ERROR",
        beta: "ERROR",
        notes: `Failed to fetch: ${error.message}`
      });
    }
  }

  console.table(results);
  console.log("\n==========================================\n");
}

simulate().catch(console.error);
