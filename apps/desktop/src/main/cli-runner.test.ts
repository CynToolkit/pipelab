import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { startAuthenticatedCliProcess } from "./cli-bootstrap";
import { getLocalCliRunner } from "./cli-runner";

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolveExit) => {
    const finish = (exited: boolean) => {
      child.removeListener("exit", onExit);
      clearTimeout(timer);
      resolveExit(exited);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onExit = () => {
      finish(true);
    };
    child.once("exit", onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
}

async function stopWindowsProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (child.pid === undefined) {
    child.kill();
    if (!(await waitForExit(child, 5_000))) {
      throw new Error("Windows CLI child has no process ID and did not exit after termination.");
    }
    return;
  }

  const treeStopped = await new Promise<boolean>((resolveTaskkill) => {
    const taskkill = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      taskkill.kill();
      resolveTaskkill(false);
    }, 5_000);
    const finish = (success: boolean) => {
      clearTimeout(timer);
      resolveTaskkill(success);
    };
    taskkill.once("error", () => finish(false));
    taskkill.once("close", (code) => finish(code === 0));
  });

  if (treeStopped && (await waitForExit(child, 5_000))) return;

  child.kill();
  if (!(await waitForExit(child, 5_000))) {
    throw new Error("Windows CLI process tree did not exit within 10 seconds of cleanup.");
  }
  if (!treeStopped) {
    throw new Error("taskkill.exe could not confirm termination of the Windows CLI process tree.");
  }
}

async function stopWindowsProcess(pid: number): Promise<void> {
  if (!(await isWindowsProcessRunning(pid))) return;
  const taskkillSucceeded = await new Promise<boolean>((resolveTaskkill) => {
    const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      taskkill.kill();
      resolveTaskkill(false);
    }, 5_000);
    const finish = (success: boolean) => {
      clearTimeout(timer);
      resolveTaskkill(success);
    };
    taskkill.once("error", () => finish(false));
    taskkill.once("close", (code) => finish(code === 0));
  });

  if (!taskkillSucceeded || (await isWindowsProcessRunning(pid))) {
    try {
      process.kill(pid);
    } catch (error) {
      if (!isProcessMissing(error)) throw error;
    }
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await isWindowsProcessRunning(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Windows descendant process ${pid} did not exit within 5 seconds.`);
}

function isProcessMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ESRCH");
}

describe("getLocalCliRunner", () => {
  it("resolves tsx's JavaScript entry point from Desktop instead of the platform shim", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { args } = getLocalCliRunner(projectRoot, entryPoint, "linux", "electron");

    assert.equal(
      args[0],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli"),
    );
    assert.match(args[0]!, /[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    assert.equal(args[1], entryPoint);
    assert.equal(args[2], "serve");
    assert.doesNotMatch(args[0]!, /node_modules[\\/]\.bin[\\/]tsx$/);
  });

  it("uses the installed Node runtime for the local CLI on Windows", () => {
    const result = getLocalCliRunner(undefined, "apps/cli/src/index.ts", "win32", "electron.exe");
    assert.equal(result.executable, process.env.npm_node_execpath || "node.exe");
    assert.deepEqual(result.args, ["--import", "tsx", "apps/cli/src/index.ts", "serve"]);
  });

  it("uses the resolved tsx loader with Node directly on Windows", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { executable, args } = getLocalCliRunner(
      projectRoot,
      entryPoint,
      "win32",
      "electron.exe",
      process.env.npm_node_execpath || "node.exe",
    );

    assert.equal(executable, process.env.npm_node_execpath || "node.exe");
    assert.equal(args[0], "--import");
    assert.equal(
      args[1],
      pathToFileURL(
        createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx"),
      ).href,
    );
    assert.equal(args[2], entryPoint);
    assert.equal(args[3], "serve");
  });

  it(
    "stops a Windows CLI process tree within a bounded cleanup window",
    { skip: process.platform !== "win32" },
    async () => {
      const script = [
        'import { spawn } from "node:child_process";',
        'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
        "process.stdout.write(String(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("\n");
      const parent = spawn(process.execPath, ["-e", script], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let descendantPid: number | undefined;

      try {
        if (!parent.stdout) throw new Error("Windows process tree fixture has no output stream.");
        const startWaiting = Date.now();
        parent.stdout.setEncoding("utf8");
        let startTimer!: NodeJS.Timeout;
        let pidChunk: unknown;
        try {
          [pidChunk] = await Promise.race([
            once(parent.stdout, "data"),
            new Promise<never>((_resolve, reject) => {
              startTimer = setTimeout(
                () => reject(new Error("Windows process tree fixture did not start.")),
                5000,
              );
            }),
          ]);
        } finally {
          clearTimeout(startTimer);
        }
        descendantPid = Number(String(pidChunk));
        assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);

        await stopWindowsProcessTree(parent);
        assert.ok(Date.now() - startWaiting < 10_000);
        assert.equal(await isWindowsProcessRunning(descendantPid), false);
      } finally {
        try {
          if (parent.exitCode === null && parent.signalCode === null) {
            await stopWindowsProcessTree(parent);
          }
        } finally {
          if (descendantPid !== undefined) await stopWindowsProcess(descendantPid);
        }
      }
    },
  );

  it(
    "starts the local TypeScript CLI on Windows",
    { skip: process.platform !== "win32" },
    async () => {
      const projectRoot = resolve(process.cwd(), "../..");
      const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
      const { executable, args } = getLocalCliRunner(
        projectRoot,
        entryPoint,
        process.platform,
        process.execPath,
        process.env.npm_node_execpath || "node.exe",
      );
      const userDataPath = await mkdtemp(join(tmpdir(), "pipelab-desktop-cli-runner-"));
      let child: ChildProcess | undefined;
      let processTreeStopped = false;
      try {
        const started = await startAuthenticatedCliProcess({
          executable,
          args: [...args, "--port", "0", "--host", "127.0.0.1", "--user-data", userDataPath],
          cwd: projectRoot,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: undefined,
            IS_SERVER: "true",
            NODE_ENV: "development",
            PORT: "0",
          },
          desktopVersion: "2.0.0-beta.33",
          readyTimeoutMs: 30_000,
          onSpawn: (process) => {
            child = process;
          },
          onStartupFailure: async (process) => {
            await stopWindowsProcessTree(process);
            processTreeStopped = true;
          },
        });
        assert.ok(started.port > 0 && started.port <= 65535);
        assert.ok(child?.pid !== undefined);
      } finally {
        try {
          if (child && !processTreeStopped) await stopWindowsProcessTree(child);
        } finally {
          await rm(userDataPath, { recursive: true, force: true });
        }
      }
    },
  );
});

async function isWindowsProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isProcessMissing(error)) return false;
    throw error;
  }
}
