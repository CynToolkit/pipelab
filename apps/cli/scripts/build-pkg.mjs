import { execSync } from "child_process";
import os from "os";

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

// Build target string (e.g. node22-macos-arm64)
const target = `node24-${targetOs}-${targetArch}`;

console.log(`[build-pkg.mjs] Target OS: ${targetOs}`);
console.log(`[build-pkg.mjs] Target Arch: ${targetArch}`);
console.log(`[build-pkg.mjs] Running pkg with target: ${target}`);

try {
  // Execute pkg
  execSync(`npx pkg . --output bin/pipelab -t ${target}`, { 
    stdio: "inherit",
    env: process.env // pass through path for npx etc
  });
} catch (err) {
  console.error("[build-pkg.mjs] pkg failed", err);
  process.exit(1);
}
