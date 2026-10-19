import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
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
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once("exit", onExit);
  });
}

async function stopWindowsProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  if (await waitForExit(child, 5_000)) return;
  if (child.pid === undefined) throw new Error("Windows CLI child has no process ID to terminate.");

  await new Promise<void>((resolveTaskkill) => {
    const taskkill = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      taskkill.kill();
      resolveTaskkill();
    }, 5_000);
    const finish = () => {
      clearTimeout(timer);
      resolveTaskkill();
    };
    taskkill.once("error", finish);
    taskkill.once("close", finish);
  });

  if (!(await waitForExit(child, 5_000))) {
    throw new Error("Windows CLI process tree did not exit after taskkill.");
  }
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
        });
        assert.ok(started.port > 0 && started.port <= 65535);
        assert.ok(child?.pid !== undefined);
      } finally {
        try {
          if (child) await stopWindowsProcessTree(child);
        } finally {
          await rm(userDataPath, { recursive: true, force: true });
        }
      }
    },
  );
});
