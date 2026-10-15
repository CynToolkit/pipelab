import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleDesktopBootstrapRequest,
  readDesktopBootstrapEnvironment,
} from "./desktop-bootstrap";

const secret = Buffer.alloc(32, 47);
const sessionId = "c57909d3-18f2-42d8-8f87-44da667dd20c";
const challenge = Buffer.alloc(32, 13).toString("base64url");
const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function bootstrapRequest(body: unknown, method = "POST") {
  const server = http.createServer((request, response) => {
    void handleDesktopBootstrapRequest(request, response, {
      secret,
      sessionId,
      version: "2.1.0-beta.4",
    }).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP server address");

  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/__pipelab/desktop-bootstrap",
        method,
        headers: { "content-type": "application/json" },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (responseBody += chunk));
        response.on("end", () => resolve({ status: response.statusCode || 0, body: responseBody }));
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body) ?? "");
  });
}

describe("Desktop CLI bootstrap endpoint", () => {
  it("enables only a complete cryptographic launch session", () => {
    expect(readDesktopBootstrapEnvironment({})).toBeUndefined();
    expect(() =>
      readDesktopBootstrapEnvironment({ PIPELAB_DESKTOP_SESSION_ID: sessionId }),
    ).toThrow(/environment is incomplete/);
    expect(() =>
      readDesktopBootstrapEnvironment({
        PIPELAB_DESKTOP_BOOTSTRAP_SECRET: "short",
        PIPELAB_DESKTOP_SESSION_ID: sessionId,
      }),
    ).toThrow(/credentials are invalid/);
    expect(
      readDesktopBootstrapEnvironment({
        PIPELAB_DESKTOP_BOOTSTRAP_SECRET: Buffer.alloc(32, 47).toString("base64url"),
        PIPELAB_DESKTOP_SESSION_ID: sessionId,
      }),
    ).toEqual({ secret, sessionId });
  });

  it("returns an authenticated Pipelab CLI identity for the launch challenge", async () => {
    const response = await bootstrapRequest({ challenge });

    expect(response.status).toBe(200);
    const identity = JSON.parse(response.body) as {
      identity: string;
      protocolVersion: number;
      version: string;
      sessionId: string;
      pid: number;
      parentPid: number;
      challenge: string;
      proof: string;
    };
    const { proof, ...signedIdentity } = identity;

    expect(signedIdentity).toMatchObject({
      identity: "pipelab-cli",
      protocolVersion: 1,
      version: "2.1.0-beta.4",
      sessionId,
      challenge,
    });
    expect(identity.pid).toBe(process.pid);
    expect(Number.isInteger(identity.parentPid)).toBe(true);
    expect(proof).toBe(
      createHmac("sha256", secret).update(JSON.stringify(signedIdentity)).digest("base64url"),
    );
    expect(response.body).not.toContain(secret.toString("utf8"));
  });

  it("rejects missing, malformed, and non-POST challenges", async () => {
    expect((await bootstrapRequest({})).status).toBe(400);
    expect((await bootstrapRequest({ challenge: "short" })).status).toBe(400);
    expect((await bootstrapRequest({ challenge }, "GET")).status).toBe(405);
  });

  it("does not answer requests from a non-loopback peer", async () => {
    const chunks = [Buffer.from(JSON.stringify({ challenge }))];
    const request = {
      method: "POST",
      url: "/__pipelab/desktop-bootstrap",
      socket: { remoteAddress: "198.51.100.23" },
      async *[Symbol.asyncIterator]() {
        yield* chunks;
      },
    } as unknown as IncomingMessage;
    let status = 0;
    let body = "";
    const response = {
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(value?: string) {
        body = value || "";
        return this;
      },
    } as unknown as ServerResponse;

    await expect(
      handleDesktopBootstrapRequest(request, response, {
        secret,
        sessionId,
        version: "2.1.0-beta.4",
      }),
    ).resolves.toBe(true);
    expect(status).toBe(403);
    expect(body).not.toContain(secret.toString("utf8"));
  });
});
