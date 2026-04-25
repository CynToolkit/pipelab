import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execa } from "execa";

const appName = process.argv[2];
if (!appName) {
  console.error("Please provide the app name to publish (e.g. ui, cli)");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const appPackageJsonPath = join(root, "apps", appName, "package.json");
let appDistDir = join(root, "apps", appName, "dist");

// In CI, artifacts are downloaded to the "artifacts" directory
const ciDistDir = join(root, "artifacts", "monorepo-dist", "apps", appName, "dist");
if (!existsSync(appDistDir) && existsSync(ciDistDir)) {
  console.log(`Detected CI artifact directory at ${ciDistDir}`);
  appDistDir = ciDistDir;
}

if (!existsSync(appPackageJsonPath)) {
  console.error(`Package.json not found for app: ${appName} at ${appPackageJsonPath}`);
  process.exit(1);
}

async function main() {
  try {
    const { stdout: whoami } = await execa("npm", ["whoami"]);
    console.log(`Currently logged in as: ${whoami}`);
  } catch (err) {
    console.warn("Could not determine current npm user. Make sure you are logged in.");
  }

  console.log(`Reading ${appName} package.json...`);
  const appPackageJson = JSON.parse(readFileSync(appPackageJsonPath, "utf-8"));
  const { version, license, author, repository, description } = appPackageJson;

  console.log(`Preparing @pipelab/${appName} v${version} for publishing...`);

  const dynamicPackageJson = {
    name: `@pipelab/${appName}`,
    version,
    description: description || `The ${appName} assets for Pipelab`,
    license,
    author,
    repository,
    private: false,
    type: "module",
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    ...(appName === "cli"
      ? {
          bin: {
            pipelab: "./index.mjs",
            plab: "./index.mjs",
          },
        }
      : {}),
    dependencies: {}, // Self-contained
  };

  const outputPath = join(appDistDir, "package.json");
  console.log(`Writing dynamic package.json to ${outputPath}...`);
  if (!existsSync(appDistDir)) {
    console.warn(`Warning: dist directory ${appDistDir} not found, creating it...`);
    mkdirSync(appDistDir, { recursive: true });
  }
  writeFileSync(outputPath, JSON.stringify(dynamicPackageJson, null, 2));

  console.log("Publishing to npm...");

  // Handle prerelease tags (e.g. 2.0.1-beta.12 -> tag: beta)
  const args = ["publish", "--access", "public"];
  const prereleaseMatch = version.match(/-(.*)\./);
  if (prereleaseMatch && prereleaseMatch[1]) {
    const tag = prereleaseMatch[1];
    console.log(`Detected prerelease version, using tag: ${tag}`);
    args.push("--tag", tag);
  }

  try {
    // Using standard npm for the publish as it sometimes handles scoped paths more reliably
    await execa("npm", args, {
      cwd: appDistDir,
      stdio: "inherit",
    });
    console.log(`Successfully published @pipelab/${appName}!`);
  } catch (error) {
    console.error(`Failed to publish @pipelab/${appName}:`);
    console.error(error.message);
    if (process.env.CI) {
      process.exit(1);
    }
  }
}

main();
