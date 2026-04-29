import { spawn, ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import http from "node:http";
import fs from "node:fs";
import { websocketPort, uiDevPort, getUiDevServerFatalError } from "@pipelab/constants";
import { fetchPipelabCli, projectRoot, PipelabContext, getDefaultUserDataPath } from "@pipelab/core-node";

let serverProcess: ChildProcess | null = null;

const isUp = (port: number, retries = 20, delay = 500, silent = false): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const attempt = (remainingRetries: number) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        if (!silent) console.info(`[Server Check] Server is up on port ${port}`);
        resolve(true);
      });

      req.on("error", () => {
        if (remainingRetries > 0) {
          if (!silent && (remainingRetries % 5 === 0 || remainingRetries === 20)) {
            console.info(
              `[Server Check] Waiting for server on port ${port}... (${remainingRetries} retries left)`,
            );
          }
          setTimeout(() => attempt(remainingRetries - 1), delay);
        } else {
          if (!silent) {
            console.error(
              `[Server Check] Server failed to come up on port ${port} after all retries`,
            );
          }
          resolve(false);
        }
      });
    };
    attempt(retries);
  });

export const startServer = async () => {
  if (serverProcess) {
    return;
  }

  const userDataPath = getDefaultUserDataPath();

  // 0. In dev mode, ensure UI dev server is running BEFORE anything else
  if (is.dev) {
    const isUIUp = await isUp(uiDevPort, 2, 500, true);
    if (!isUIUp) {
      console.error(getUiDevServerFatalError(uiDevPort));
      throw new Error("UI dev server not found. App cannot start in development mode.");
    }
  }

  // 1. Check if server is already running
  const alreadyUp = await isUp(websocketPort, is.dev ? 2 : 1, 500, true);
  if (alreadyUp) {
    console.info(`[Server] Server already running on port ${websocketPort}`);
    return;
  }

  if (is.dev) {
    console.info("  [DEVELOPMENT MODE] CLI server is starting automatically.");
  }

  // 2. Resolve the CLI
  const context = new PipelabContext({ userDataPath });
  const { entryPoint, isLocal, packageDir } = await fetchPipelabCli("latest", { context });

  let serverPath = process.execPath;
  let args = [entryPoint, "serve"];

  if (isLocal && entryPoint.endsWith(".ts")) {
    console.info(
      `[Server] Local CLI detected at ${packageDir}, starting with hot-reload (tsx watch)`,
    );
    const tsxPath = projectRoot ? join(projectRoot, "node_modules", ".bin", "tsx") : "tsx";
    // When using tsx, we still use Electron as the runner
    args = [tsxPath, "watch", entryPoint, "serve"];
  } else {
    console.info(`[Server] Starting CLI server from: ${entryPoint}`);
  }

  serverProcess = spawn(serverPath, args, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: is.dev ? "development" : "production",
      PORT: websocketPort.toString(),
      IS_SERVER: "true",
    },
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  serverProcess.on("error", (err) => console.error("ERROR: Failed to spawn server:", err));
  serverProcess.stdout?.on("data", (d) => console.info(`[Server] ${d.toString().trim()}`));
  serverProcess.stderr?.on("data", (d) => console.error(`[Server Error] ${d.toString().trim()}`));
  
  let isServerRunning = true;
  serverProcess.on("close", (code) => {
    console.info(`Server process exited with code ${code}`);
    serverProcess = null;
    isServerRunning = false;
  });

  // Wait for the "ready" message via IPC
  console.log(`[Server] Waiting for 'ready' signal from CLI...`);
  
  await new Promise<void>((resolve, reject) => {
    if (!serverProcess) return reject(new Error("Server process failed to start."));

    const onMessage = (msg: any) => {
      if (msg && msg.type === "ready") {
        console.log(`[Server] CLI is ready!`);
        serverProcess?.off("message", onMessage);
        serverProcess?.off("close", onClose);
        resolve();
      }
    };

    const onClose = (code: number | null) => {
      serverProcess?.off("message", onMessage);
      reject(new Error(`Server process exited with code ${code} before sending ready signal.`));
    };

    serverProcess.on("message", onMessage);
    serverProcess.on("close", onClose);
  });
};

export const stopServer = () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
