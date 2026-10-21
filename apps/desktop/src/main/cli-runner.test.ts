import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  getWindowsProcessCreationTime,
  startAuthenticatedCliProcess,
  stopCliProcessTree,
} from "./cli-bootstrap";
import { getLocalCliRunner } from "./cli-runner";

async function stopRecordedProcess(pid: number): Promise<void> {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (isProcessMissing(error)) return;
      throw error;
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (!(await isProcessRunning(pid))) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Descendant process ${pid} did not exit within 5 seconds.`);
  }

  if (!(await isProcessRunning(pid))) return;
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

  if (!taskkillSucceeded || (await isProcessRunning(pid))) {
    try {
      process.kill(pid);
    } catch (error) {
      if (!isProcessMissing(error)) throw error;
    }
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await isProcessRunning(pid))) return;
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
    assert.deepEqual(result.args, ["tsx", "apps/cli/src/index.ts", "serve"]);
  });

  it("uses tsx's JavaScript CLI entry point with Node directly on Windows", () => {
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
    assert.equal(
      args[0],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli"),
    );
    assert.equal(args[1], entryPoint);
    assert.equal(args[2], "serve");
  });

  it("stops a CLI process tree within a bounded cleanup window", async () => {
    const script = [
      'import { spawn } from "node:child_process";',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
      "process.stdout.write(String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const parent = spawn(process.execPath, ["-e", script], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let descendantPid: number | undefined;
    let launcherCreationTime: string | undefined;
    let descendantCreationTime: string | undefined;

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
      if (process.platform === "win32") {
        if (parent.pid === undefined) throw new Error("Windows process tree fixture has no PID.");
        [launcherCreationTime, descendantCreationTime] = await Promise.all([
          getWindowsProcessCreationTime(parent.pid),
          getWindowsProcessCreationTime(descendantPid),
        ]);
      }

      await stopCliProcessTree(parent, descendantPid, descendantCreationTime, launcherCreationTime);
      assert.ok(Date.now() - startWaiting < 10_000);
      await waitForProcessExit(descendantPid);
      assert.equal(await isProcessRunning(descendantPid), false);
    } finally {
      try {
        if (parent.exitCode === null && parent.signalCode === null) {
          await stopCliProcessTree(
            parent,
            descendantPid,
            descendantCreationTime,
            launcherCreationTime,
          );
        }
      } finally {
        if (descendantPid !== undefined) await stopRecordedProcess(descendantPid);
      }
    }
  });

  it(
    "reports a Windows same-PID cleanup failure even when the server PID is known",
    { skip: process.platform !== "win32" },
    async () => {
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
      });
      try {
        assert.ok(child.pid !== undefined);
        const creationTime = await getWindowsProcessCreationTime(child.pid);
        const staleCreationTime = (BigInt(creationTime) + 10_000n).toString();

        await assert.rejects(
          stopCliProcessTree(child, child.pid, creationTime, staleCreationTime),
          /Could not confirm termination of the Windows CLI process tree/,
        );
        await waitForProcessExit(child.pid);
        assert.equal(await isProcessRunning(child.pid), false);
      } finally {
        if (child.pid !== undefined && (await isProcessRunning(child.pid))) {
          child.kill();
          await waitForProcessExit(child.pid);
        }
      }
    },
  );

  it("stops a CLI descendant after the wrapper has exited", async () => {
    const script = [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: ${process.platform === "win32"}, stdio: "ignore" });`,
      "child.unref();",
      "process.stdout.write(String(child.pid));",
    ].join("\n");
    const parent = spawn(process.execPath, ["-e", script], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let descendantPid: number | undefined;
    let descendantCreationTime: string | undefined;
    try {
      const [pidChunk] = await once(parent.stdout, "data");
      descendantPid = Number(String(pidChunk));
      assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
      if (process.platform === "win32") {
        descendantCreationTime = await getWindowsProcessCreationTime(descendantPid);
      }
      if (parent.exitCode === null && parent.signalCode === null) await once(parent, "close");
      assert.notEqual(parent.exitCode, null);
      assert.equal(await isProcessRunning(descendantPid), true);

      if (process.platform === "win32") {
        await stopCliProcessTree(parent, descendantPid, descendantCreationTime);
        await waitForProcessExit(descendantPid);
        assert.equal(await isProcessRunning(descendantPid), false);
      } else {
        await stopCliProcessTree(parent, descendantPid, descendantCreationTime);
        await waitForProcessExit(descendantPid);
        await stopCliProcessTree(parent, descendantPid);
      }
    } finally {
      if (descendantPid !== undefined) await stopRecordedProcess(descendantPid);
    }
  });

  it(
    "escalates process-group cleanup when the CLI server ignores SIGTERM",
    { skip: process.platform === "win32" },
    async () => {
      const script = [
        'import { spawn } from "node:child_process";',
        'const child = spawn(process.execPath, ["-e", `process.on("SIGTERM", () => {}); process.stdout.write("READY"); setInterval(() => {}, 1000)`], { stdio: ["ignore", "pipe", "ignore"] });',
        'child.stdout.once("data", () => { child.stdout.destroy(); child.unref(); process.stdout.write(String(child.pid)); });',
      ].join("\n");
      const parent = spawn(process.execPath, ["-e", script], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let descendantPid: number | undefined;
      try {
        const [pidChunk] = await once(parent.stdout, "data");
        descendantPid = Number(String(pidChunk));
        assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
        if (parent.exitCode === null && parent.signalCode === null) await once(parent, "close");
        assert.equal(await isProcessRunning(descendantPid), true);

        await stopCliProcessTree(parent, descendantPid);
        await waitForProcessExit(descendantPid);
        assert.equal(await isProcessRunning(descendantPid), false);
      } finally {
        if (descendantPid !== undefined) await stopRecordedProcess(descendantPid);
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
      const configuredUserDataPath = process.env.PIPELAB_TEST_USER_DATA_PATH;
      const userDataPath =
        configuredUserDataPath ?? (await mkdtemp(join(tmpdir(), "pipelab-desktop-cli-runner-")));
      let child: ChildProcess | undefined;
      let processTreeStopped = false;
      let serverPid: number | undefined;
      let serverCreationTime: string | undefined;
      let launcherCreationTime: string | undefined;
      try {
        if (process.platform === "win32") {
          const runtimeEnvKeys = Object.keys(process.env)
            .filter((key) => /^(?:ELECTRON_|NODE_|npm_node_execpath$)/i.test(key))
            .sort()
            .join(",");
          console.info(
            `[Test] Windows CLI host: parent=${process.execPath}, cwd=${process.cwd()}, temp=${tmpdir()}, environment keys=${runtimeEnvKeys || "none"}`,
          );
        }
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
          onStartupFailure: async (
            process,
            authenticatedPid,
            authenticatedCreationTime,
            launcherCreation,
          ) => {
            await stopCliProcessTree(
              process,
              authenticatedPid,
              authenticatedCreationTime,
              launcherCreation,
            );
            processTreeStopped = true;
          },
        });
        assert.ok(started.port > 0 && started.port <= 65535);
        assert.ok(child?.pid !== undefined);
        serverPid = started.serverPid;
        serverCreationTime = started.serverCreationTime;
        launcherCreationTime = started.launcherCreationTime;
      } finally {
        try {
          if (child && !processTreeStopped) {
            await stopCliProcessTree(child, serverPid, serverCreationTime, launcherCreationTime);
          }
        } finally {
          if (!configuredUserDataPath) {
            await rm(userDataPath, { recursive: true, force: true });
          }
        }
      }
    },
  );
});

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
      if (state === "Z" || state === "X") return false;
    }
    return true;
  } catch (error) {
    if (isProcessMissing(error)) return false;
    throw error;
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (await isProcessRunning(pid)) {
    if (Date.now() >= deadline)
      throw new Error(`Process ${pid} did not exit within ${timeoutMs} ms.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
