import { execSync } from "child_process";
import os from "os";

const platform = os.platform();
const arch = process.env.TARGET_ARCH || os.arch();

let targetOs = "linux";
if (platform === "win32") targetOs = "win";
if (platform === "darwin") targetOs = "macos";

let targetArch = arch;
if (arch === "x86_64") targetArch = "x64"; // Ensure standard names
if (arch === "aarch64") targetArch = "arm64";

// e.g. node22-macos-arm64
const target = `node22-${targetOs}-${targetArch}`;

console.log(`Building CLI for target: ${target}`);
execSync(`npx pkg . --output bin/pipelab -t ${target}`, { stdio: "inherit", cwd: "apps/cli" });
