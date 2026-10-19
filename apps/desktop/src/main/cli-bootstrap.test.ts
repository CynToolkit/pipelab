import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
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
  it("observes process exit before descendants release inherited stdout", async () => {
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { spawn } from "node:child_process";
         spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 600)"], { stdio: ["ignore", 1, "ignore"] });
         setTimeout(() => process.exit(23), 25);`,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let closed = false;
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        monitorCliProcessExit(child, (code, signal) => resolve({ code, signal }));
        child.once("error", reject);
        child.once("close", () => {
          closed = true;
        });
      },
    );
    const exit = await Promise.race([
      exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("CLI exit monitoring waited for stdio closure")), 2000),
      ),
    ]);

    assert.equal(exit.code, 23);
    assert.equal(closed, false);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Descendant did not release stdout")), 2000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
});
