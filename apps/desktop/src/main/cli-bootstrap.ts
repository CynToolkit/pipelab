import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import semver from "semver";
import { desktopBootstrapProtocolVersion } from "@pipelab/constants";

const BOOTSTRAP_PATH = "/__pipelab/desktop-bootstrap";
const READY_PREFIX = "PIPELAB_DESKTOP_READY:";
const READY_TIMEOUT_MS = 120_000;
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
  onStartupFailure?: (
    child: ChildProcess,
    serverPid?: number,
    serverCreationTime?: string,
    launcherCreationTime?: string,
  ) => Promise<void> | void;
}

export interface AuthenticatedCliProcess {
  child: ChildProcess;
  port: number;
  sessionId: string;
  serverPid: number;
  serverCreationTime?: string;
  launcherCreationTime?: string;
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
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
      if (state === "Z" || state === "X") return false;
    }
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return false;
    }
    return true;
  }
}

function isProcessGroupRunning(groupId: number): boolean {
  try {
    process.kill(-groupId, 0);
  } catch (error) {
    return !(error && typeof error === "object" && "code" in error && error.code === "ESRCH");
  }

  if (process.platform !== "linux") return true;

  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        const state = fields[0];
        const processGroup = Number(fields[2]);
        if (processGroup === groupId && state !== "Z" && state !== "X") return true;
      } catch {
        // The process may exit between listing /proc and reading its stat file.
      }
    }
    return false;
  } catch {
    return true;
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessRunning(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function waitForProcessGroupExit(groupId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupRunning(groupId)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

export async function getWindowsProcessCreationTime(pid: number): Promise<string> {
  const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $p) { exit 3 }; [Console]::Out.Write($p.StartTime.ToUniversalTime().Ticks.ToString())`;
  return new Promise((resolve, reject) => {
    const powershell = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      powershell.kill();
      finish(new Error("Timed out verifying the Windows CLI process identity."));
    }, 5_000);
    const finish = (error?: Error, value?: string) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    powershell.stdout?.setEncoding("utf8");
    powershell.stdout?.on("data", (chunk: string) => {
      output += chunk;
    });
    powershell.once("error", () =>
      finish(new Error("Could not verify the Windows CLI process identity.")),
    );
    powershell.once("close", (code) => {
      const creationTime = output.trim();
      if (code === 0 && /^\d+$/.test(creationTime)) finish(undefined, creationTime);
      else finish(new Error("Could not verify the Windows CLI process identity."));
    });
  });
}

async function stopWindowsProcessTree(pid: number, expectedCreationTime: string): Promise<boolean> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$rootId = ${pid}`,
    `$expectedTicks = '${expectedCreationTime}'`,
    "$all = @(Get-CimInstance Win32_Process)",
    "$rootRow = $all | Where-Object { $_.ProcessId -eq $rootId } | Select-Object -First 1",
    "if ($null -eq $rootRow) { exit 3 }",
    "$root = Get-Process -Id $rootId -ErrorAction Stop",
    "$rootStartTicks = $root.StartTime.ToUniversalTime().Ticks; $rootStartKey = [long]($rootStartTicks - ($rootStartTicks % 10000))",
    "$expectedRawTicks = [long]$expectedTicks; $expectedKey = [long]($expectedRawTicks - ($expectedRawTicks % 10000)); if ($rootStartKey -ne $expectedKey) { exit 4 }",
    "$ids = New-Object 'System.Collections.Generic.HashSet[int]'",
    "$null = $ids.Add($rootId)",
    "$births = @{}; foreach ($row in $all) { $births[[int]$row.ProcessId] = $row.CreationDate.ToUniversalTime().Ticks }",
    "$changed = $true",
    "while ($changed) { $changed = $false; foreach ($row in $all) { $parentId = [int]$row.ParentProcessId; if ($ids.Contains($parentId) -and $births.ContainsKey($parentId) -and $row.CreationDate.ToUniversalTime().Ticks -gt $births[$parentId] -and $ids.Add([int]$row.ProcessId)) { $changed = $true } } }",
    "$targets = @()",
    "foreach ($row in $all) { if ($ids.Contains([int]$row.ProcessId)) { $proc = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue; if ($null -ne $proc) { $startTicks = $proc.StartTime.ToUniversalTime().Ticks; $startKey = [long]($startTicks - ($startTicks % 10000)); $rowTicks = $row.CreationDate.ToUniversalTime().Ticks; $rowKey = [long]($rowTicks - ($rowTicks % 10000)); if ($startKey -eq $rowKey) { $targets += $proc } } } }",
    "if (-not ($targets | Where-Object { $_.Id -eq $rootId })) { exit 4 }",
    "$targets | Where-Object { $_.Id -ne $rootId } | ForEach-Object { $_.Kill() }",
    "$root.Kill()",
    "$stopped = $true; foreach ($proc in $targets) { if (-not $proc.WaitForExit(5000)) { $stopped = $false } }; if (-not $stopped) { exit 5 }",
  ].join("; ");

  return new Promise((resolve) => {
    const powershell = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: "ignore" },
    );
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(success);
    };
    const timer = setTimeout(() => {
      powershell.kill();
      finish(false);
    }, 10_000);
    powershell.once("error", () => finish(false));
    powershell.once("close", (code) => {
      if (code === 0) finish(true);
      else if (code === 3) finish(!isProcessRunning(pid));
      else finish(false);
    });
  });
}

/** Stop the CLI and any child it created before Desktop exits or abandons startup. */
export async function stopCliProcessTree(
  child: ChildProcess,
  serverPid?: number,
  serverCreationTime?: string,
  launcherCreationTime?: string,
): Promise<void> {
  if (process.platform === "win32") {
    const launcherPid = child.pid;
    const launcherWasRunning =
      launcherPid !== undefined && child.exitCode === null && child.signalCode === null;
    let treeStopped = true;

    if (launcherWasRunning && launcherPid !== undefined) {
      if (!launcherCreationTime) {
        child.kill();
        throw new Error("Could not safely verify the Windows CLI launcher before cleanup.");
      }
      treeStopped = await stopWindowsProcessTree(launcherPid, launcherCreationTime);
      if (!treeStopped) child.kill();
    }

    if (serverPid !== undefined && serverPid !== launcherPid && isProcessRunning(serverPid)) {
      if (!serverCreationTime) {
        throw new Error(
          "Could not safely verify the authenticated Windows CLI server before cleanup.",
        );
      }
      const serverStopped = await stopWindowsProcessTree(serverPid, serverCreationTime);
      if (!serverStopped) {
        throw new Error(
          "Could not safely terminate the authenticated Windows CLI server process tree.",
        );
      }
    }

    if (!treeStopped) {
      throw new Error("Could not confirm termination of the Windows CLI process tree.");
    }

    if (launcherPid !== undefined && !(await waitForChildExit(child, 5_000))) {
      child.kill();
      if (!(await waitForChildExit(child, 5_000))) {
        throw new Error("The Windows CLI launcher did not stop within 10 seconds of cleanup.");
      }
    }

    if (!launcherWasRunning && serverPid === undefined) {
      throw new Error("Could not identify the Windows CLI server process for cleanup.");
    }
    return;
  }

  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") {
        throw error;
      }
    }
  } else {
    child.kill();
  }

  const groupId = child.pid;
  if (groupId !== undefined && !(await waitForProcessGroupExit(groupId, 5_000))) {
    try {
      process.kill(-groupId, "SIGKILL");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") {
        throw error;
      }
    }
    if (!(await waitForProcessGroupExit(groupId, 5_000))) {
      throw new Error("The CLI process group did not stop within 10 seconds of cleanup.");
    }
  }

  if (!(await waitForChildExit(child, 5_000))) {
    child.kill();
    if (!(await waitForChildExit(child, 5_000))) {
      throw new Error("The CLI launcher did not stop within 10 seconds of cleanup.");
    }
  }
  if (serverPid !== undefined && !(await waitForProcessExit(serverPid, 5_000))) {
    throw new Error("The authenticated CLI server did not stop after process-group cleanup.");
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
      if (error) {
        if (remainingOutput.trim()) console.info(`[CLI] ${remainingOutput.trimEnd()}`);
        reject(error);
      } else if (message) {
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
  let launcherCreationTime: string | undefined;
  let serverCreationTime: string | undefined;

  try {
    const [ready] = await Promise.all([
      waitForReadyMessage(child, credentials.sessionId, options.readyTimeoutMs ?? READY_TIMEOUT_MS),
      process.platform === "win32" && child.pid !== undefined
        ? getWindowsProcessCreationTime(child.pid).then((creationTime) => {
            launcherCreationTime = creationTime;
          })
        : Promise.resolve(),
    ]);
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
    if (process.platform === "win32") {
      serverCreationTime =
        response.pid === child.pid
          ? launcherCreationTime
          : await getWindowsProcessCreationTime(response.pid);
    }
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
      ...(serverCreationTime ? { serverCreationTime } : {}),
      ...(launcherCreationTime ? { launcherCreationTime } : {}),
    };
  } catch (error) {
    try {
      await options.onStartupFailure?.(
        child,
        authenticatedServerPid,
        serverCreationTime,
        launcherCreationTime,
      );
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
