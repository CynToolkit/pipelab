import { spawn, ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import http from "node:http";
import fs from "node:fs";
import { websocketPort } from "@pipelab/constants";
import { fetchPipelabCli, setUserDataPath, ensureNodeJS, projectRoot } from "@pipelab/core-node";


let serverProcess: ChildProcess | null = null;

const isUp = (port: number, retries = 20, delay = 500): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const attempt = (remainingRetries: number) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        console.info(`[Server Check] Server is up on port ${port}`);
        resolve(true);
      });

      req.on("error", () => {
        if (remainingRetries > 0) {
          if (remainingRetries % 5 === 0 || remainingRetries === 20) {
            console.info(
              `[Server Check] Waiting for server on port ${port}... (${remainingRetries} retries left)`,
            );
          }
          setTimeout(() => attempt(remainingRetries - 1), delay);
        } else {
          console.error(
            `[Server Check] Server failed to come up on port ${port} after all retries`,
          );
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

  const userDataPath = app.getPath("userData");
  setUserDataPath(userDataPath);

  // 1. Ensure runtime environment (Node.js) is ready FIRST
  const nodePath = await ensureNodeJS("24.14.1").catch((e) => {
    console.warn(`[Server] Failed to ensure specific Node.js version, falling back to system 'node': ${e.message}`);
    return "node";
  });

  // 2. Check if server is already running
  const alreadyUp = await isUp(websocketPort, is.dev ? 2 : 1, 500);
  if (alreadyUp) {
    console.info(`[Server] Server already running on port ${websocketPort}`);
    return;
  }

  // 3. Resolve the CLI (will use nodePath if installation is needed)
  const { entryPoint, isLocal, packageDir } = await fetchPipelabCli(undefined, { nodePath });

  let serverPath = nodePath;
  let args = [entryPoint, "serve", "--user-data", userDataPath];

  if (isLocal && entryPoint.endsWith(".ts")) {
    console.info(`[Server] Local CLI detected at ${packageDir}, starting with hot-reload (tsx watch)`);
    const tsxPath = projectRoot ? join(projectRoot, "node_modules", ".bin", "tsx") : "tsx";
    serverPath = tsxPath;
    args = ["watch", entryPoint, "serve", "--user-data", userDataPath];
  } else {
    console.info(`[Server] Starting CLI server from: ${entryPoint}`);
  }

  serverProcess = spawn(serverPath, args, {
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: is.dev ? "development" : "production",
    },
  });

  serverProcess.on("error", (err) => console.error("ERROR: Failed to spawn server:", err));
  serverProcess.stdout?.on("data", (d) => console.info(`[Server] ${d.toString().trim()}`));
  serverProcess.stderr?.on("data", (d) => console.error(`[Server Error] ${d.toString().trim()}`));
  serverProcess.on("close", (code) => {
    console.info(`Server process exited with code ${code}`);
    serverProcess = null;
  });

  // Wait for server to be ready
  const up = await isUp(websocketPort, is.dev ? 20 : 10);
  if (!up) {
    throw new Error(`Server failed to start on port ${websocketPort}`);
  }
};

export const stopServer = () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
