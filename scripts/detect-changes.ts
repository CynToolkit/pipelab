import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  affectedPackagesForChanges,
  desktopVersionChanged,
  needsDesktopBuild,
  needsMacosSmoke,
  needsWindowsSmoke,
} from "./detect-changes-logic.mjs";

/**
 * This script parses the JSON output of `turbo ls --output=json`
 * and exposes a single stringified JSON array of all affected package names.
 * It also detects if any of the affected packages have a "build" script.
 */

interface TurboPackage {
  name: string;
  path: string;
}

interface TurboLsOutput {
  packages: {
    items: TurboPackage[];
  };
}

function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(
      "Usage: tsx detect-changes.ts <turbo-ls-output.json> <changed-files.txt> [base-ref]",
    );
    process.exit(1);
  }

  try {
    const rawData = readFileSync(inputFile, "utf-8");
    const data: TurboLsOutput = JSON.parse(rawData);
    const changedFilesFile = process.argv[3];
    if (!changedFilesFile) {
      console.error("Missing changed files input");
      process.exit(1);
    }
    const changedFiles = readFileSync(changedFilesFile, "utf-8").split(/\r?\n/).filter(Boolean);
    const baseRef = process.argv[4];
    const desktopPackage = JSON.parse(
      readFileSync(join(process.cwd(), "apps/desktop/package.json"), "utf-8"),
    ) as { version?: unknown };
    const desktopVersion = typeof desktopPackage.version === "string" ? desktopPackage.version : "";
    let baseDesktopVersion: string | undefined;
    if (baseRef) {
      try {
        const basePackage = JSON.parse(
          execFileSync("git", ["show", `${baseRef}:apps/desktop/package.json`], {
            encoding: "utf-8",
          }),
        ) as { version?: unknown };
        if (typeof basePackage.version === "string") baseDesktopVersion = basePackage.version;
      } catch {
        // A missing base package (for example, an initial history) cannot prove a version change.
      }
    }

    // Avoid root lockfile/CI fanout when those changes accompany website-only work.
    const affectedPackages = affectedPackagesForChanges(
      data.packages.items.map((p) => p.name),
      changedFiles,
    );
    const affectedPackageSet = new Set(affectedPackages);
    const affectedPackageItems = data.packages.items.filter((p) => affectedPackageSet.has(p.name));
    const desktopBuild = needsDesktopBuild(changedFiles);
    const windowsSmoke = needsWindowsSmoke(changedFiles);
    const macosSmoke = needsMacosSmoke(changedFiles);
    const versionChanged = desktopVersionChanged(changedFiles, baseDesktopVersion, desktopVersion);

    // Check if any affected package needs a build
    let needsBuild = false;
    for (const p of affectedPackageItems) {
      try {
        const pkgJsonPath = join(process.cwd(), p.path, "package.json");
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        if (pkgJson.scripts?.build) {
          needsBuild = true;
          break;
        }
      } catch (err) {
        console.warn(`Could not read package.json for ${p.name} at ${p.path}`);
      }
    }

    console.log("--- Affected Packages Detected by Turbo ---");
    console.log(JSON.stringify(affectedPackages, null, 2));
    console.log(`Needs Build: ${needsBuild}`);
    console.log("-------------------------------------------");

    // Set GitHub Action outputs
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      // The array needs to be stringified for GHA to handle it as a single string
      writeFileSync(githubOutput, `affected=${JSON.stringify(affectedPackages)}\n`, { flag: "a" });
      writeFileSync(githubOutput, `needs_build=${needsBuild}\n`, { flag: "a" });
      writeFileSync(githubOutput, `desktop_changed=${desktopBuild}\n`, { flag: "a" });
      writeFileSync(githubOutput, `needs_desktop_build=${desktopBuild}\n`, { flag: "a" });
      writeFileSync(githubOutput, `needs_windows_smoke=${windowsSmoke}\n`, { flag: "a" });
      writeFileSync(githubOutput, `needs_macos_smoke=${macosSmoke}\n`, { flag: "a" });
      writeFileSync(githubOutput, `desktop_version_changed=${versionChanged}\n`, { flag: "a" });
      writeFileSync(githubOutput, `desktop_version=${desktopVersion}\n`, { flag: "a" });
      console.log(
        "Successfully set GITHUB_OUTPUT: affected, needs_build, needs_desktop_build, needs_windows_smoke, needs_macos_smoke, desktop_version_changed, desktop_version",
      );
    } else {
      console.log("Not running in GitHub Actions, skipping GITHUB_OUTPUT");
    }
  } catch (error) {
    console.error("Failed to parse turbo output:", error);
    process.exit(1);
  }
}

main();
