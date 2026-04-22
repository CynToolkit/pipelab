import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execa } from "execa";

const root = resolve(process.cwd());
const uiPackageJsonPath = join(root, "apps", "ui", "package.json");
let uiDistDir = join(root, "apps", "ui", "dist");

// In CI, artifacts are downloaded to the "artifacts" directory
const ciDistDir = join(root, "artifacts", "monorepo-dist", "apps", "ui", "dist");
if (!existsSync(uiDistDir) && existsSync(ciDistDir)) {
  console.log(`Detected CI artifact directory at ${ciDistDir}`);
  uiDistDir = ciDistDir;
}

async function main() {
  console.log("Reading UI package.json...");
  const uiPackageJson = JSON.parse(readFileSync(uiPackageJsonPath, "utf-8"));
  const { version, license, author, repository } = uiPackageJson;

  console.log(`Preparing @pipelab/ui v${version} for publishing...`);

  const dynamicPackageJson = {
    name: "@pipelab/ui",
    version,
    description: "The UI assets for Pipelab",
    license,
    author,
    repository,
    private: false,
    type: "module",
    publishConfig: {
      access: "public",
    },
    dependencies: {}, // Self-contained
  };

  const outputPath = join(uiDistDir, "package.json");
  console.log(`Writing dynamic package.json to ${outputPath}...`);
  if (!existsSync(uiDistDir)) {
    console.warn(`Warning: dist directory ${uiDistDir} not found, creating it...`);
    mkdirSync(uiDistDir, { recursive: true });
  }
  writeFileSync(outputPath, JSON.stringify(dynamicPackageJson, null, 2));

  console.log("Publishing to npm...");
  
  // Handle prerelease tags (e.g. 2.0.1-beta.12 -> tag: beta)
  const args = ["publish", "--access", "public", "--no-git-checks"];
  const prereleaseMatch = version.match(/-(.*)\./);
  if (prereleaseMatch && prereleaseMatch[1]) {
    const tag = prereleaseMatch[1];
    console.log(`Detected prerelease version, using tag: ${tag}`);
    args.push("--tag", tag);
  }

  try {
    const { stdout } = await execa("pnpm", args, {
      cwd: uiDistDir,
    });
    console.log(stdout);
    console.log("Successfully published @pipelab/ui!");
  } catch (error) {
    console.error("Failed to publish @pipelab/ui:");
    console.error(error.message);
    if (process.env.CI) {
        process.exit(1);
    }
  }
}

main();
