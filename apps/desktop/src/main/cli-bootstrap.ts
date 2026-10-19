import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import semver from "semver";
import { desktopBootstrapProtocolVersion } from "@pipelab/constants";

const BOOTSTRAP_PATH = "/__pipelab/desktop-bootstrap";
const READY_PREFIX = "PIPELAB_DESKTOP_READY:";
const READY_TIMEOUT_MS = 60_000;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const MAX_READY_BYTES = 2048;
const MAX_IDENTITY_BYTES = 8192;

const BOOTSTRAP_SECRET_ENV = "PIPELAB_DESKTOP_BOOTSTRAP_SECRET";
const BOOTSTRAP_SESSION_ENV = "PIPELAB_DESKTOP_SESSION_ID";

interface BootstrapCredentials {
  secret: Buffer;
  sessionId: string;
}

interface BootstrapReadyMessage {
  type: "ready";
  port: number;
  sessionId: string;
}

export interface DesktopBootstrapIdentity {
  identity: string;
  protocolVersion: number;
  version: string;
  sessionId: string;
  pid: number;
  parentPid: number;
  challenge: string;
  proof: string;
}

interface StartAuthenticatedCliOptions {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  desktopVersion: string;
  readyTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  onSpawn?: (child: ChildProcess) => void;
  onStartupFailure?: (child: ChildProcess, serverPid?: number) => Promise<void> | void;
}

export interface AuthenticatedCliProcess {
  child: ChildProcess;
  port: number;
  sessionId: string;
  serverPid: number;
}

/** Observe process exit immediately, even if a descendant still holds stdio open. */
export function monitorCliProcessExit(
  child: ChildProcess,
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void,
): void {
  child.once("exit", onExit);
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const finish = (exited: boolean) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onExit = () => finish(true);
    child.once("exit", onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return false;
    }
    return true;
  }
}

/** Stop the CLI and any child it created before Desktop exits or abandons startup. */
export async function stopCliProcessTree(child: ChildProcess, serverPid?: number): Promise<void> {
  const childExited = child.exitCode !== null || child.signalCode !== null;
  if (childExited && child.pid === undefined) return;

  let treeTerminationConfirmed = true;
  if (process.platform === "win32" && child.pid !== undefined) {
    if (childExited) {
      const serverStopped =
        serverPid === child.pid || (serverPid !== undefined && !isProcessRunning(serverPid));
      if (serverStopped && !isProcessRunning(child.pid)) return;
      throw new Error(
        "The CLI launcher exited while its server may still be running. Desktop cannot safely stop that process by PID; close the Pipelab CLI process, then retry.",
      );
    }

    const stopWindowsTree = async (pid: number): Promise<boolean> =>
      new Promise((resolve) => {
        const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
          stdio: "ignore",
        });
        const timer = setTimeout(() => {
          taskkill.kill();
          resolve(false);
        }, 5_000);
        const finish = (success: boolean) => {
          clearTimeout(timer);
          resolve(success);
        };
        taskkill.once("error", () => finish(false));
        taskkill.once("close", (code) => finish(code === 0));
      });

    const treeStopped = await stopWindowsTree(child.pid);
    if (!treeStopped) {
      treeTerminationConfirmed = false;
      if (!childExited) child.kill();
    }
  } else if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") {
        treeTerminationConfirmed = false;
      }
      if (!childExited) child.kill();
    }
  } else {
    child.kill();
  }

  if (childExited) {
    if (!treeTerminationConfirmed) {
      throw new Error("Could not confirm termination of the CLI process tree.");
    }
    return;
  }

  if (await waitForChildExit(child, 5_000)) {
    if (!treeTerminationConfirmed) {
      throw new Error("Could not confirm termination of the CLI process tree.");
    }
    return;
  }
  child.kill();
  if (!(await waitForChildExit(child, 5_000))) {
    throw new Error("The CLI process did not stop within 10 seconds of cleanup.");
  }
}

const createCredentials = (): BootstrapCredentials => ({
  secret: randomBytes(32),
  sessionId: randomUUID(),
});

const signedPayload = (identity: Omit<DesktopBootstrapIdentity, "proof">): string =>
  JSON.stringify({
    identity: identity.identity,
    protocolVersion: identity.protocolVersion,
    version: identity.version,
    sessionId: identity.sessionId,
    pid: identity.pid,
    parentPid: identity.parentPid,
    challenge: identity.challenge,
  });

export function verifyDesktopBootstrapIdentity(
  value: unknown,
  options: {
    secret: Buffer;
    challenge: string;
    sessionId: string;
    desktopVersion: string;
    childPid: number;
  },
): asserts value is DesktopBootstrapIdentity {
  if (!value || typeof value !== "object") {
    throw new Error("The CLI server returned an invalid identity. Restart Desktop and try again.");
  }
  const identity = value as Partial<DesktopBootstrapIdentity>;
  if (
    typeof identity.identity !== "string" ||
    typeof identity.protocolVersion !== "number" ||
    typeof identity.version !== "string" ||
    typeof identity.sessionId !== "string" ||
    typeof identity.pid !== "number" ||
    !Number.isSafeInteger(identity.pid) ||
    typeof identity.parentPid !== "number" ||
    !Number.isSafeInteger(identity.parentPid) ||
    typeof identity.challenge !== "string" ||
    typeof identity.proof !== "string"
  ) {
    throw new Error(
      "The CLI server returned an incomplete identity. Update Pipelab and restart Desktop.",
    );
  }

  const { proof, ...unsignedIdentity } = identity as DesktopBootstrapIdentity;
  const expectedProof = createHmac("sha256", options.secret)
    .update(signedPayload(unsignedIdentity))
    .digest();
  const receivedProof = Buffer.from(proof, "base64url");
  if (
    receivedProof.length !== expectedProof.length ||
    receivedProof.toString("base64url") !== proof ||
    !timingSafeEqual(receivedProof, expectedProof)
  ) {
    throw new Error(
      "The process on the temporary CLI port could not prove it belongs to this Desktop launch. Close other Pipelab processes and restart Desktop.",
    );
  }

  if (identity.challenge !== options.challenge) {
    throw new Error(
      "The CLI server answered an old or unexpected startup challenge. Close other Pipelab processes and restart Desktop.",
    );
  }
  if (identity.identity !== "pipelab-cli") {
    throw new Error(
      "An unexpected process answered on the temporary CLI port. Close the conflicting process and restart Desktop.",
    );
  }
  if (identity.sessionId !== options.sessionId) {
    throw new Error(
      "The CLI server belongs to a stale Desktop session. Quit other Pipelab instances and restart Desktop.",
    );
  }
  if (identity.protocolVersion !== desktopBootstrapProtocolVersion) {
    throw new Error(
      `The CLI server uses unsupported bootstrap protocol ${identity.protocolVersion}; Desktop requires ${desktopBootstrapProtocolVersion}. Update or reinstall Pipelab.`,
    );
  }

  const cliVersion = semver.valid(identity.version);
  const desktopVersion = semver.valid(options.desktopVersion);
  if (!cliVersion || !desktopVersion || semver.major(cliVersion) !== semver.major(desktopVersion)) {
    throw new Error(
      `The CLI server version (${identity.version}) is incompatible with Desktop (${options.desktopVersion}). Update or reinstall Pipelab.`,
    );
  }
  if (identity.pid !== options.childPid && identity.parentPid !== options.childPid) {
    throw new Error(
      "The authenticated CLI server is not the process Desktop started. Close conflicting Pipelab processes and restart Desktop.",
    );
  }
}

function waitForReadyMessage(
  child: ChildProcess,
  sessionId: string,
  timeoutMs: number,
): Promise<BootstrapReadyMessage> {
  const channel = child.stdout;
  if (!channel) {
    return Promise.reject(
      new Error("The CLI process has no startup output channel. Update Pipelab."),
    );
  }

  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeListener("data", onData);
      channel.removeListener("error", onError);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    };
    const finish = (error?: Error, message?: BootstrapReadyMessage) => {
      if (settled) return;
      settled = true;
      const remainingOutput = buffer;
      cleanup();
      if (error) reject(error);
      else if (message) {
        if (remainingOutput.trim()) console.info(`[CLI] ${remainingOutput.trimEnd()}`);
        channel.on("data", (chunk: Buffer | string) => {
          const line = chunk.toString().trimEnd();
          if (line) console.info(`[CLI] ${line}`);
        });
        resolve(message);
      } else reject(new Error("The CLI process sent an empty startup message."));
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `The CLI server did not become ready within ${Math.ceil(timeoutMs / 1000)} seconds. Check the CLI installation, then restart Desktop.`,
          ),
        ),
      timeoutMs,
    );
    const onError = () =>
      finish(
        new Error(
          "The CLI process failed during startup. Reinstall Pipelab, then restart Desktop.",
        ),
      );
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      finish(
        new Error(
          `The CLI server exited before startup verification (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}). Check the CLI installation, then restart Desktop.`,
        ),
      );
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      while (!settled) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) {
          if (Buffer.byteLength(buffer, "utf8") > MAX_READY_BYTES) {
            console.info(`[CLI] ${buffer.trimEnd()}`);
            buffer = "";
          }
          return;
        }

        const line = buffer.slice(0, newline).trimEnd();
        buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line, "utf8") > MAX_READY_BYTES) {
          console.info(`[CLI] ${line}`);
          continue;
        }
        if (!line.startsWith(READY_PREFIX)) {
          if (line) console.info(`[CLI] ${line}`);
          continue;
        }
        let message: unknown;
        try {
          message = JSON.parse(line.slice(READY_PREFIX.length));
        } catch {
          finish(
            new Error("The CLI sent an invalid startup message. Update or reinstall Pipelab."),
          );
          return;
        }
        if (!message || typeof message !== "object") {
          finish(
            new Error("The CLI sent an invalid startup message. Update or reinstall Pipelab."),
          );
          return;
        }
        const ready = message as Partial<BootstrapReadyMessage>;
        if (
          ready.type !== "ready" ||
          !Number.isInteger(ready.port) ||
          (ready.port ?? 0) < 1 ||
          (ready.port ?? 0) > 65535 ||
          typeof ready.sessionId !== "string"
        ) {
          finish(
            new Error("The CLI sent an invalid startup address. Update or reinstall Pipelab."),
          );
          return;
        }
        if (ready.sessionId !== sessionId) {
          finish(
            new Error(
              "The CLI announced a stale Desktop session. Quit other Pipelab instances and restart Desktop.",
            ),
          );
          return;
        }
        finish(undefined, ready as BootstrapReadyMessage);
      }
    };

    channel.on("data", onData);
    channel.once("error", onError);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function requestIdentity(port: number, challenge: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBody: Buffer[] = [];
    let responseSize = 0;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(value);
    };
    const fail = (message: string) => {
      finish(new Error(message));
      request.destroy();
    };
    const deadline = setTimeout(
      () =>
        fail(
          `The CLI startup handshake did not finish within ${Math.ceil(timeoutMs / 1000)} seconds. Restart Desktop; if this persists, reinstall Pipelab.`,
        ),
      timeoutMs,
    );
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: BOOTSTRAP_PATH,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
      },
      (response) => {
        response.on("data", (chunk: Buffer) => {
          responseSize += chunk.length;
          if (responseSize > MAX_IDENTITY_BYTES) {
            fail("The CLI identity response exceeded its size limit. Update or reinstall Pipelab.");
            return;
          }
          responseBody.push(chunk);
        });
        response.once("aborted", () =>
          fail("The CLI identity response was interrupted. Restart Desktop and try again."),
        );
        response.once("error", () =>
          fail("The CLI identity response failed. Restart Desktop and try again."),
        );
        response.once("close", () => {
          if (!response.complete) {
            fail("The CLI identity response ended unexpectedly. Restart Desktop and try again.");
          }
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            finish(
              new Error(
                `The CLI bootstrap handshake returned HTTP ${response.statusCode ?? "unknown"}. Update or reinstall Pipelab.`,
              ),
            );
            return;
          }
          try {
            finish(undefined, JSON.parse(Buffer.concat(responseBody).toString("utf8")) as unknown);
          } catch {
            finish(
              new Error(
                "The CLI returned an invalid startup identity. Update or reinstall Pipelab.",
              ),
            );
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () =>
      fail("The CLI startup handshake timed out. Restart Desktop and try again."),
    );
    request.on("error", (error) =>
      finish(
        new Error(
          `The CLI server did not answer its local startup handshake (${error.message}). Restart Desktop; if this persists, reinstall Pipelab.`,
        ),
      ),
    );
    request.end(JSON.stringify({ challenge }));
  });
}

export async function startAuthenticatedCliProcess(
  options: StartAuthenticatedCliOptions,
): Promise<AuthenticatedCliProcess> {
  const credentials = createCredentials();
  const child = spawn(options.executable, options.args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    detached: process.platform !== "win32",
    env: {
      ...options.env,
      [BOOTSTRAP_SECRET_ENV]: credentials.secret.toString("base64url"),
      [BOOTSTRAP_SESSION_ENV]: credentials.sessionId,
    },
    stdio: ["inherit", "pipe", "inherit"],
  });
  options.onSpawn?.(child);
  let authenticatedServerPid: number | undefined;

  try {
    const ready = await waitForReadyMessage(
      child,
      credentials.sessionId,
      options.readyTimeoutMs ?? READY_TIMEOUT_MS,
    );
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        "The CLI server exited before startup verification. Restart Desktop and try again.",
      );
    }

    const challenge = randomBytes(32).toString("base64url");
    const response = await requestIdentity(
      ready.port,
      challenge,
      options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    );
    verifyDesktopBootstrapIdentity(response, {
      secret: credentials.secret,
      challenge,
      sessionId: credentials.sessionId,
      desktopVersion: options.desktopVersion,
      childPid: child.pid,
    });
    authenticatedServerPid = response.pid;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        "The CLI server exited during startup verification. Restart Desktop and try again.",
      );
    }

    return {
      child,
      port: ready.port,
      sessionId: credentials.sessionId,
      serverPid: response.pid,
    };
  } catch (error) {
    try {
      await options.onStartupFailure?.(child, authenticatedServerPid);
    } catch (cleanupError) {
      child.kill();
      throw new AggregateError(
        [error, cleanupError],
        "The CLI failed startup verification and its process tree could not be cleaned up.",
      );
    }
    child.kill();
    throw error;
  } finally {
    credentials.secret.fill(0);
  }
}
