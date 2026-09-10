import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.join(desktopDir, "..", "ui");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const timeoutMs = 120_000;
const forgeArgs = process.platform === "linux" ? ["--headless", "--no-sandbox"] : ["--headless"];

const uiProcess = spawn(command, ["run", "dev"], {
  cwd: uiDir,
  env: process.env,
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
  windowsVerbatimArguments: false,
});
const child = spawn(command, ["run", "start", "--", ...forgeArgs], {
  cwd: desktopDir,
  env: { ...process.env, PIPELAB_E2E: "1" },
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
  windowsVerbatimArguments: false,
});

let output = "";
let settled = false;

const appendOutput = (chunk) => {
  output += chunk.toString();
};

const stopProcessTree = (processToStop) => {
  if (!processToStop.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill.exe", ["/pid", String(processToStop.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    processToStop.kill();
  }
};

uiProcess.stdout.on("data", appendOutput);
uiProcess.stderr.on("data", appendOutput);

const waitForUi = new Promise((resolve, reject) => {
  const deadline = Date.now() + 30_000;
  const check = () => {
    const request = http.get("http://127.0.0.1:5173", (response) => {
      response.resume();
      resolve();
    });
    request.on("error", () => {
      if (Date.now() >= deadline) {
        reject(new Error("UI Vite server did not start on port 5173"));
      } else {
        setTimeout(check, 250);
      }
    });
  };
  check();
});

const finish = (error) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  stopProcessTree(uiProcess);
  stopProcessTree(child);
  if (error) {
    console.error(output);
    throw error;
  }
};

const timer = setTimeout(() => {
  finish(new Error(`Electron smoke test timed out after ${timeoutMs}ms`));
}, timeoutMs);

const onOutput = (chunk) => {
  appendOutput(chunk);
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

waitForUi.catch((error) => finish(error));
