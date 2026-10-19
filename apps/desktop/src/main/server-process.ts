import type { ChildProcess } from "node:child_process";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import http from "node:http";
import { uiDevPort, getUiDevServerFatalError } from "@pipelab/constants";
import {
  fetchPipelabCli,
  projectRoot,
  PipelabContext,
  getDefaultUserDataPath,
} from "@pipelab/core-node/desktop";
import { monitorCliProcessExit, startAuthenticatedCliProcess } from "./cli-bootstrap";
import { getLocalCliRunner } from "./cli-runner";

let serverProcess: ChildProcess | null = null;
let serverPort: number | null = null;

const isUp = (
  port: number,
  delay = 1000,
  shouldContinue?: () => boolean,
  silent = false,
): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
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

export const startServer = async (): Promise<number> => {
  if (serverProcess) {
    if (serverPort === null) throw new Error("The CLI server startup is still in progress.");
    return serverPort;
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

  if (is.dev) {
    console.info("  [DEVELOPMENT MODE] CLI server is starting automatically.");
  }

  // 2. Resolve the CLI
  const releaseTag = app.getVersion().includes("beta") ? "beta" : "latest";
  const userDataPath = getDefaultUserDataPath(releaseTag === "beta" ? "beta" : "prod");
  const context = new PipelabContext({ userDataPath, releaseTag });
  const cliVersion = is.dev ? "local" : releaseTag;
  const { entryPoint, isLocal, packageDir } = await fetchPipelabCli(cliVersion, { context });

  let args = [entryPoint, "serve"];
  let executable = process.execPath;

  if (isLocal && entryPoint.endsWith(".ts")) {
    console.info(`[Server] Local CLI detected at ${packageDir}, starting with tsx`);
    // A single CLI process keeps its authenticated, OS-assigned port stable.
    // The UI still uses Vite HMR; restart Desktop after changing CLI source.
    ({ executable, args } = getLocalCliRunner(
      projectRoot,
      entryPoint,
      process.platform,
      process.execPath,
    ));
    console.info(`[Server] Local CLI executable: ${executable}`);
    console.info(`[Server] Local CLI arguments: ${args.join(" ")}`);
  } else {
    console.info(`[Server] Starting CLI server from: ${entryPoint}`);
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: is.dev ? "development" : "production",
    PORT: "0",
    IS_SERVER: "true",
  };
  if (executable === process.execPath) {
    childEnv.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete childEnv.ELECTRON_RUN_AS_NODE;
  }
  // Keep the server's CLI context on the same profile the Desktop resolves above.
  args = [...args, "--port", "0", "--host", "127.0.0.1", "--user-data", userDataPath];

  const started = await startAuthenticatedCliProcess({
    executable,
    args,
    env: childEnv,
    desktopVersion: app.getVersion(),
    onSpawn: (child) => {
      serverProcess = child;
      child.on("error", (error) => console.error("ERROR: CLI server process failed:", error));
      monitorCliProcessExit(child, (code) => {
        if (serverProcess === child && serverPort !== null) {
          console.error(
            `The authenticated CLI process exited with code ${code ?? "unknown"}. Closing Desktop to prevent reconnecting to an unverified local process; restart Desktop to try again.`,
          );
          serverPort = null;
          app.exit(1);
        }
      });
      child.on("close", (code) => {
        console.info(`CLI server process exited with code ${code}`);
        if (serverProcess === child) {
          serverProcess = null;
          serverPort = null;
        }
      });
    },
  });
  if (serverProcess !== started.child || started.child.exitCode !== null) {
    throw new Error(
      "The CLI server stopped during startup verification. Restart Desktop and try again.",
    );
  }
  serverPort = started.port;

  console.info(`[Server] Authenticated CLI server is ready on loopback port ${started.port}`);
  return started.port;
};

export const stopServer = () => {
  if (serverProcess) {
    const child = serverProcess;
    serverProcess = null;
    serverPort = null;
    child.kill();
  }
};
