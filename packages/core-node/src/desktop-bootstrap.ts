import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desktopBootstrapProtocolVersion } from "@pipelab/constants";

export const desktopBootstrapPath = "/__pipelab/desktop-bootstrap";
const MAX_BOOTSTRAP_REQUEST_BYTES = 1024;

export interface DesktopBootstrapOptions {
  secret: Buffer;
  sessionId: string;
  version: string;
}

export type DesktopBootstrapCredentials = Omit<DesktopBootstrapOptions, "version">;

export interface DesktopBootstrapIdentity {
  identity: "pipelab-cli";
  protocolVersion: number;
  version: string;
  sessionId: string;
  pid: number;
  parentPid: number;
  challenge: string;
}

const isLoopbackAddress = (address: string | undefined): boolean => {
  if (!address) return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized.startsWith("127.") || normalized === "::1";
};

const respond = (response: ServerResponse, status: number, body?: string) => {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
};

const readRequestBody = async (request: IncomingMessage): Promise<Buffer | "too-large"> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > MAX_BOOTSTRAP_REQUEST_BYTES) {
      request.resume();
      return "too-large";
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const isChallenge = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length !== 43) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === value;
};

export const desktopBootstrapProofPayload = (identity: DesktopBootstrapIdentity): string =>
  JSON.stringify({
    identity: identity.identity,
    protocolVersion: identity.protocolVersion,
    version: identity.version,
    sessionId: identity.sessionId,
    pid: identity.pid,
    parentPid: identity.parentPid,
    challenge: identity.challenge,
  });

export async function handleDesktopBootstrapRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DesktopBootstrapOptions,
): Promise<boolean> {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname !== desktopBootstrapPath) return false;

  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    respond(response, 403, "{}");
    return true;
  }
  if (url.search || request.method !== "POST") {
    respond(response, 405, "{}");
    return true;
  }

  let body: Buffer | "too-large";
  try {
    body = await readRequestBody(request);
  } catch {
    respond(response, 400, "{}");
    return true;
  }
  if (body === "too-large") {
    respond(response, 413, "{}");
    return true;
  }

  let challenge: unknown;
  try {
    challenge = (JSON.parse(body.toString("utf8")) as { challenge?: unknown }).challenge;
  } catch {
    respond(response, 400, "{}");
    return true;
  }
  if (!isChallenge(challenge)) {
    respond(response, 400, "{}");
    return true;
  }

  const identity: DesktopBootstrapIdentity = {
    identity: "pipelab-cli",
    protocolVersion: desktopBootstrapProtocolVersion,
    version: options.version,
    sessionId: options.sessionId,
    pid: process.pid,
    parentPid: process.ppid,
    challenge,
  };
  const proof = createHmac("sha256", options.secret)
    .update(desktopBootstrapProofPayload(identity))
    .digest("base64url");
  respond(response, 200, JSON.stringify({ ...identity, proof }));
  return true;
}

export function readDesktopBootstrapEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DesktopBootstrapCredentials | undefined {
  const secret = env.PIPELAB_DESKTOP_BOOTSTRAP_SECRET;
  const sessionId = env.PIPELAB_DESKTOP_SESSION_ID;
  if (secret === undefined && sessionId === undefined) return undefined;
  if (secret === undefined || sessionId === undefined) {
    throw new Error("Desktop CLI bootstrap environment is incomplete; restart the Desktop app.");
  }

  const decodedSecret = Buffer.from(secret, "base64url");
  if (
    decodedSecret.length !== 32 ||
    decodedSecret.toString("base64url") !== secret ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
  ) {
    throw new Error("Desktop CLI bootstrap credentials are invalid; restart the Desktop app.");
  }

  if (env === process.env) {
    delete env.PIPELAB_DESKTOP_BOOTSTRAP_SECRET;
    delete env.PIPELAB_DESKTOP_SESSION_ID;
  }

  return { secret: decodedSecret, sessionId };
}
