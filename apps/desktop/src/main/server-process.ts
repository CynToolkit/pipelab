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
  let serverPath: string;
  let args: string[] = ["serve", "--user-data", userDataPath];

  console.log("is.dev", is.dev);

  if (is.dev) {
    // // In dev, we run from the source using ts-node or similar
    // // Actually, we can just point to the built dist/index.js in the cli package
    // serverPath = 'node'
    // args = [join(__dirname, '../../../cli/dist/index.js'), 'serve']
    // In dev, wait for the dev to start it manually
    const up = await isUp(websocketPort);
    if (!up) {
      throw new Error("In development mode, please start the server manually");
    }
  } else {
    // In production, we fetch the bundle from remote
    setUserDataPath(userDataPath);
    let cliPath: string | undefined;

    if (projectRoot) {
      const localCli = join(projectRoot, "apps", "cli", "dist", "index.mjs");
      if (fs.existsSync(localCli)) {
        cliPath = localCli;
        console.info(`[Server] Project root detected, using local CLI: ${cliPath}`);
      }
    }

    if (!cliPath) {
      cliPath = await fetchPipelabCli();
    }

    const nodePath = await ensureNodeJS("24.14.1");

    serverPath = nodePath;
    args = [cliPath, ...args];

    console.info(`Starting server: ${serverPath} ${args.join(" ")}`);

    serverProcess = spawn(serverPath, args, {
      stdio: "pipe",
      env: {
        ...process.env,
      },
    });

    serverProcess.on("error", (err) => console.error("ERROR: Failed to spawn server:", err));
    serverProcess.stdout?.on("data", (d) => console.info(`[Server] ${d.toString().trim()}`));
    serverProcess.stderr?.on("data", (d) => console.error(`[Server Error] ${d.toString().trim()}`));
    serverProcess.on("close", (code) => {
      console.info(`Server process exited with code ${code}`);
      serverProcess = null;
    });

    // Give it a moment to start
    const up = await isUp(websocketPort);
    if (!up) {
      throw new Error(`Server failed to start on port ${websocketPort}`);
    }
  }
};

export const stopServer = () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
