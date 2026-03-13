import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { exit } from "node:process";
import WebSocket from "ws";
import { websocketPort } from "@pipelab/constants";

let serverProcess: ChildProcess | null = null;

const isUp = (url: string, retries = 20, delay = 500): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const attempt = (remainingRetries: number) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        if (remainingRetries > 0) {
          setTimeout(() => attempt(remainingRetries - 1), delay);
        } else {
          resolve(false);
        }
      };
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
    console.error("In development mode, please start the server manually");
    const up = await isUp(`ws://localhost:${websocketPort}`);
    if (!up) {
      throw new Error(`Server failed to start on port ${websocketPort}`);
    }
  } else {
    // In production, we use the bundled binary
    // The binary should be placed in a known location relative to the app
    const platform =
      process.platform === "win32"
        ? "win"
        : process.platform === "darwin"
        ? "macos"
        : "linux";
    const binaryName =
      `pipelab-${platform}` + (process.platform === "win32" ? ".exe" : "");
    serverPath = join(process.resourcesPath, "bin", binaryName);

    console.info("Starting standalone server:", serverPath, args.join(" "));

    serverProcess = spawn(serverPath, args, {
      stdio: "pipe",
      env: {
        ...process.env,
        // Pass any necessary env vars to the server
      },
    });

    serverProcess.stdout?.on("data", (data) => {
      console.info(`[Server] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on("data", (data) => {
      console.error(`[Server Error] ${data.toString().trim()}`);
    });

    serverProcess.on("close", (code) => {
      console.info(`Server process exited with code ${code}`);
      serverProcess = null;
    });

    // Give it a moment to start
    const up = await isUp(`ws://localhost:${websocketPort}`);
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
