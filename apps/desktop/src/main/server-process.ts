import { spawn, ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import http from "node:http";
import fs from "node:fs";
import { websocketPort, uiDevPort, getUiDevServerFatalError } from "@pipelab/constants";
import {
  fetchPipelabCli,
  projectRoot,
  PipelabContext,
  getDefaultUserDataPath,
} from "@pipelab/core-node/desktop";

let serverProcess: ChildProcess | null = null;

const isUp = (
  port: number,
  delay = 1000,
  shouldContinue?: () => boolean,
  silent = false,
): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const attempt = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        if (!silent) console.info(`[Server Check] Server is up on port ${port}`);
        resolve(true);
      });

      req.on("error", () => {
        if (!shouldContinue || shouldContinue()) {
          if (!silent) {
            console.info(`[Server Check] Waiting for server on port ${port}...`);
          }
          setTimeout(attempt, delay);
        } else {
          if (!silent) {
            console.error(`[Server Check] Server check aborted for port ${port}`);
          }
          resolve(false);
        }
      });
    };
    attempt();
  });

export const startServer = async () => {
  if (serverProcess) {
    return;
  }

  // 0. In dev mode, ensure UI dev server is running BEFORE anything else
  if (is.dev) {
    let retries = 5;
    const isUIUp = await isUp(uiDevPort, 500, () => retries-- > 0, true);
    if (!isUIUp) {
      console.error(getUiDevServerFatalError(uiDevPort));
      throw new Error("UI dev server not found. App cannot start in development mode.");
    }
  }

  // 1. Check if server is already running
  let initialRetries = 1;
  const alreadyUp = await isUp(websocketPort, 500, () => initialRetries-- > 0, true);
  if (alreadyUp) {
    console.info(`[Server] Server already running on port ${websocketPort}`);
    return;
  }

  if (is.dev) {
    console.info("  [DEVELOPMENT MODE] CLI server is starting automatically.");
  }

  // 2. Resolve the CLI
  const releaseTag = app.getVersion().includes("beta") ? "beta" : "latest";
  const userDataPath = getDefaultUserDataPath(releaseTag === "beta" ? "beta" : "prod");
  const context = new PipelabContext({ userDataPath, releaseTag });
  const cliVersion = is.dev ? "local" : releaseTag;
  const { entryPoint, isLocal, packageDir } = await fetchPipelabCli(cliVersion, { context });

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

  let isServerRunning = true;
  serverProcess = spawn(serverPath, args, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: is.dev ? "development" : "production",
      PORT: websocketPort.toString(),
      IS_SERVER: "true",
    },
    stdio: ["inherit", "inherit", "inherit"],
  });

  serverProcess.on("error", (err) => console.error("ERROR: Failed to spawn server:", err));
  serverProcess.stdout?.on("data", (d) => console.info(`[Server] ${d.toString().trim()}`));
  serverProcess.stderr?.on("data", (d) => console.error(`[Server Error] ${d.toString().trim()}`));

  serverProcess.on("close", (code) => {
    console.info(`Server process exited with code ${code}`);
    serverProcess = null;
    isServerRunning = false;
  });

  // Wait for the server to be listening on the port
  console.log(`[Server] Waiting for server on port ${websocketPort}...`);
  // Wait indefinitely as long as the server process is running
  const up = await isUp(websocketPort, 1000, () => isServerRunning);
  if (!up) {
    throw new Error(`Server failed to start on port ${websocketPort} (process exited)`);
  }
  console.log(`[Server] CLI server is listening!`);
};

export const stopServer = () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
