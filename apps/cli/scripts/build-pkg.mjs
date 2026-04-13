import { execSync } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read package.json version
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
const version = pkg.version;

// Map Node's os.platform() to pkg's target OS string
const platform = os.platform();
let targetOs = "linux";
if (platform === "win32") targetOs = "win";
if (platform === "darwin") targetOs = "macos";

// Use TARGET_ARCH from CI, or default to os.arch()
const arch = process.env.TARGET_ARCH || os.arch();
let targetArch = arch;
if (arch === "x86_64") targetArch = "x64";
if (arch === "aarch64") targetArch = "arm64";

// Construct the versioned output filename
const binaryName = `pipelab-cli-v${version}-${targetOs}-${targetArch}${targetOs === "win" ? ".exe" : ""}`;
const outputPath = path.join("bin", binaryName);

// Build target string (e.g. node24-macos-arm64)
const target = `node24-${targetOs}-${targetArch}`;

console.log(`[build-pkg.mjs] Version: ${version}`);
console.log(`[build-pkg.mjs] Output: ${outputPath}`);
console.log(`[build-pkg.mjs] Running pkg with target: ${target}`);

try {
  // Execute pkg
  execSync(`npx pkg . --output ${outputPath} -t ${target}`, {
    stdio: "inherit",
    env: process.env,
  });
} catch (err) {
  console.error("[build-pkg.mjs] pkg failed", err);
  process.exit(1);
}
