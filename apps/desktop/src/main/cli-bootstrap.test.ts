import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChildProcess, spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { websocketPort } from "@pipelab/constants";
import { monitorCliProcessExit, startAuthenticatedCliProcess } from "./cli-bootstrap";

const children = new Set<ChildProcess>();

const fixture = String.raw`
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";

const mode = process.env.PIPELAB_BOOTSTRAP_FIXTURE_MODE || "valid";
if (mode === "exit") process.exit(23);
if (mode === "no-ready") {
  setInterval(() => {}, 1000);
} else {
  const server = http.createServer((request, response) => {
    if (mode === "interrupted-identity") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write("{");
      response.destroy();
      return;
    }
    if (mode === "hanging-identity") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.flushHeaders();
      return;
    }

    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const { challenge } = JSON.parse(body);
      const identity = {
        identity: mode === "wrong-identity" ? "unrelated-process" : "pipelab-cli",
        protocolVersion: mode === "wrong-protocol" ? 88 : 1,
        version: mode === "wrong-version" ? "3.0.0" : "2.1.0-beta.4",
        sessionId: mode === "stale-session"
          ? "00000000-0000-4000-8000-000000000001"
          : process.env.PIPELAB_DESKTOP_SESSION_ID,
        pid: mode === "wrong-process" ? process.pid + 10000 : process.pid,
        parentPid: process.ppid,
        challenge,
      };
      const proofSecret = mode === "forged"
        ? randomBytes(32)
        : Buffer.from(process.env.PIPELAB_DESKTOP_BOOTSTRAP_SECRET, "base64url");
      const payload = JSON.stringify(identity);
      const proof = createHmac("sha256", proofSecret).update(payload).digest("base64url");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ...identity, proof }));
    });
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const announceReady = () =>
      process.stdout.write("PIPELAB_DESKTOP_READY:" + JSON.stringify({
        type: "ready",
        port: address.port,
        sessionId: process.env.PIPELAB_DESKTOP_SESSION_ID,
      }) + "\n");
    if (mode === "delayed-ready") setTimeout(announceReady, 21_000);
    else announceReady();
  });
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
`;

afterEach(async () => {
  const activeChildren = [...children];
  children.clear();
  await Promise.all(
    activeChildren.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          child.once("close", () => resolve());
          child.kill();
          setTimeout(resolve, 1000).unref();
        }),
    ),
  );
});

async function startFixture(
  mode = "valid",
  readyTimeoutMs?: number,
  onSpawn?: (child: ChildProcess) => void,
  handshakeTimeoutMs = 1000,
  onStartupFailure?: (child: ChildProcess) => Promise<void> | void,
) {
  const started = await startAuthenticatedCliProcess({
    executable: process.execPath,
    args: ["--input-type=module", "-e", fixture],
    env: { ...process.env, PIPELAB_BOOTSTRAP_FIXTURE_MODE: mode },
    desktopVersion: "2.4.0-beta.1",
    ...(readyTimeoutMs === undefined ? {} : { readyTimeoutMs }),
    handshakeTimeoutMs,
    onSpawn: (child) => {
      children.add(child);
      onSpawn?.(child);
    },
    ...(onStartupFailure === undefined ? {} : { onStartupFailure }),
  });
  children.add(started.child);
  return started;
}

describe("authenticated Desktop CLI startup", () => {
  it("starts on an OS-assigned port and verifies the child session and version", async () => {
    const started = await startFixture();
    assert.ok(started.port > 0 && started.port <= 65535);
    assert.notEqual(started.port, websocketPort);
    assert.match(started.sessionId, /^[0-9a-f-]{36}$/i);
  });

  it("allows a cold local CLI that takes longer than 20 seconds to become ready", async () => {
    const started = await startFixture("delayed-ready");
    assert.ok(started.port > 0 && started.port <= 65535);
  });

  it("rejects an unrelated process on the former fixed Desktop port without contacting it", async (context) => {
    const legacyHits: number[] = [];
    const legacyServer = http.createServer((_request, response) => {
      legacyHits.push(1);
      response.writeHead(200).end("not Pipelab");
    });
    try {
      await new Promise<void>((resolve, reject) => {
        legacyServer.once("error", reject);
        legacyServer.listen(websocketPort, "127.0.0.1", resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        context.skip("The legacy CLI port is already occupied in this test environment.");
        return;
      }
      throw error;
    }

    try {
      const started = await startFixture();
      assert.notEqual(started.port, websocketPort);
      assert.deepEqual(legacyHits, []);
    } finally {
      await new Promise<void>((resolve) => legacyServer.close(() => resolve()));
    }
  });

  it("rejects and stops a forged process that does not know the launch secret", async () => {
    let child: ChildProcess | undefined;
    await assert.rejects(
      startFixture("forged", 2000, (spawned) => (child = spawned)),
      /could not prove it belongs to this Desktop launch/,
    );
    assert.ok(child?.killed);
  });

  it("awaits caller process-tree cleanup before terminating a failed startup", async () => {
    let child: ChildProcess | undefined;
    let beginCleanup!: () => void;
    let releaseCleanup!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => (beginCleanup = resolve));
    const cleanupGate = new Promise<void>((resolve) => (releaseCleanup = resolve));
    const startup = startFixture(
      "forged",
      2000,
      (process) => (child = process),
      1000,
      async (process) => {
        beginCleanup();
        await cleanupGate;
        process.kill();
      },
    );

    try {
      await cleanupStarted;
      assert.equal(child?.killed, false);
    } finally {
      releaseCleanup();
    }
    await assert.rejects(startup, /could not prove it belongs to this Desktop launch/);
    assert.equal(child?.killed, true);
  });

  it("rejects a validly signed response from a stale session", async () => {
    await assert.rejects(startFixture("stale-session"), /stale Desktop session/);
  });

  it("rejects a validly signed response from an unexpected process identity", async () => {
    await assert.rejects(startFixture("wrong-process"), /not the process Desktop started/);
  });

  it("rejects a validly signed response claiming a different server identity", async () => {
    await assert.rejects(startFixture("wrong-identity"), /unexpected process answered/);
  });

  it("rejects incompatible bootstrap protocol and CLI versions", async () => {
    await assert.rejects(startFixture("wrong-protocol"), /unsupported bootstrap protocol/);
    await assert.rejects(startFixture("wrong-version"), /version .* is incompatible with Desktop/);
  });

  it("fails with actionable errors when the CLI exits or never announces readiness", async () => {
    await assert.rejects(startFixture("exit"), /exited before startup verification/);
    await assert.rejects(startFixture("no-ready", 50), /did not become ready/);
  });

  it("rejects interrupted and stalled identity responses within the handshake deadline", async () => {
    await assert.rejects(startFixture("interrupted-identity"), /local startup handshake/);
    await assert.rejects(
      startFixture("hanging-identity", 2000, undefined, 100),
      /handshake did not finish within/,
    );
  });
});

describe("authenticated CLI process exit monitoring", () => {
  it("reports process exit without waiting for stdio closure", () => {
    const child = new ChildProcess();
    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let closed = false;
    child.once("close", () => (closed = true));

    monitorCliProcessExit(child, (code, signal) => (exit = { code, signal }));
    child.emit("exit", 23, null);

    assert.deepEqual(exit, { code: 23, signal: null });
    assert.equal(closed, false);
  });

  it("observes process exit independently from descendant and stdio closure", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pipelab-cli-exit-"));
    const descendantReadyPath = join(tempDir, "descendant-ready");
    const descendantDonePath = join(tempDir, "descendant-done");
    const descendantScript = `
      import { writeFileSync } from "node:fs";
      writeFileSync(process.env.PIPELAB_DESCENDANT_READY, "ready");
      process.send?.("ready");
      setTimeout(() => {
        try { writeFileSync(process.env.PIPELAB_DESCENDANT_DONE, "done"); } catch {}
        process.exit(0);
      }, 800);
    `;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { spawn } from "node:child_process";
         const descendant = spawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(descendantScript)}], { stdio: ["ignore", 1, "ignore", "ipc"] });
         descendant.on("message", () => setTimeout(() => process.exit(23), 25));`,
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
        env: {
          ...process.env,
          PIPELAB_DESCENDANT_READY: descendantReadyPath,
          PIPELAB_DESCENDANT_DONE: descendantDonePath,
        },
      },
    );
    children.add(child);
    let closed = false;
    let resolveClosed!: () => void;
    const closedPromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        monitorCliProcessExit(child, (code, signal) => resolve({ code, signal }));
        child.once("error", reject);
        child.once("close", () => {
          closed = true;
          resolveClosed();
        });
      },
    );
    const waitForPath = async (path: string, message: string) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        try {
          await access(path);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      throw new Error(message);
    };

    try {
      await waitForPath(descendantReadyPath, "Descendant did not start");
      const exit = await Promise.race([
        exited,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("CLI exit monitoring waited for stdio closure")), 2000),
        ),
      ]);

      assert.equal(exit.code, 23);
      assert.equal(
        await access(descendantDonePath).then(
          () => true,
          () => false,
        ),
        false,
      );
      if (process.platform === "win32") {
        // Windows runner process cleanup may terminate descendants with their parent,
        // so only the parent exit callback is portable on this platform.
        if (!closed) {
          await Promise.race([
            closedPromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("CLI stdio did not close after process exit")),
                2000,
              ),
            ),
          ]);
        }
      } else {
        assert.equal(closed, false);
        await waitForPath(descendantDonePath, "Descendant did not finish");
        if (!closed) await closedPromise;
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
