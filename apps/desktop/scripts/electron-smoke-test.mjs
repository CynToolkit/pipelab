import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const timeoutMs = 120_000;

const child = spawn(command, ["run", "start", "--", "--headless"], {
  cwd: desktopDir,
  env: { ...process.env, PIPELAB_E2E: "1" },
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
  windowsVerbatimArguments: false,
});

let output = "";
let settled = false;

const finish = (error) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  child.kill();
  if (error) {
    console.error(output);
    throw error;
  }
};

const timer = setTimeout(() => {
  finish(new Error(`Electron smoke test timed out after ${timeoutMs}ms`));
}, timeoutMs);

const onOutput = (chunk) => {
  output += chunk.toString();
  if (output.includes("[E2E] renderer-loaded")) {
    finish();
  }
};

child.stdout.on("data", onOutput);
child.stderr.on("data", onOutput);
child.once("error", (error) => finish(error));
child.once("close", (code) => {
  if (settled) return;
  finish(new Error(`Electron exited before the renderer loaded (code ${code})`));
});
