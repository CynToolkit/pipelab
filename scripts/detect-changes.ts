import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
    console.error("Usage: tsx detect-changes.ts <turbo-ls-output.json>");
    process.exit(1);
  }

  try {
    const rawData = readFileSync(inputFile, "utf-8");
    const data: TurboLsOutput = JSON.parse(rawData);

    // Extract all package names
    const affectedPackages = data.packages.items.map((p) => p.name);

    // Check if any affected package needs a build
    let needsBuild = false;
    for (const p of data.packages.items) {
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
      console.log("Successfully set GITHUB_OUTPUT: affected, needs_build");
    } else {
      console.log("Not running in GitHub Actions, skipping GITHUB_OUTPUT");
    }
  } catch (error) {
    console.error("Failed to parse turbo output:", error);
    process.exit(1);
  }
}

main();
