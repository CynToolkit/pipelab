import { describe, expect, test } from "vitest";
import { IncomingMessage } from "node:http";
import {
  hasValidAuthToken,
  isAllowedOrigin,
  isAuthorizedRequest,
  isLoopbackHost,
  requiresAuthentication,
} from "./server-security";

const request = (headers: Record<string, string>, url = "/") =>
  ({ headers, url }) as unknown as IncomingMessage;

describe("server security policy", () => {
  test("treats loopback hosts as local and remote hosts as protected", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(requiresAuthentication("127.0.0.1")).toBe(false);
    expect(requiresAuthentication("0.0.0.0")).toBe(true);
  });

  test("accepts a bearer token or query token", () => {
    expect(hasValidAuthToken(request({ authorization: "Bearer secret" }), "secret")).toBe(true);
    expect(hasValidAuthToken(request({}, "/?token=secret"), "secret")).toBe(true);
    expect(hasValidAuthToken(request({ authorization: "Bearer wrong" }), "secret")).toBe(false);
  });

  test("allows same-origin and explicitly configured origins only", () => {
    expect(isAllowedOrigin(request({ host: "example.test", origin: "http://example.test" }))).toBe(
      true,
    );
    expect(
      isAllowedOrigin(request({ host: "example.test", origin: "https://trusted.test" }), [
        "https://trusted.test",
      ]),
    ).toBe(true);
    expect(isAllowedOrigin(request({ host: "example.test", origin: "https://evil.test" }))).toBe(
      false,
    );
  });

  test("requires both origin and authentication for remote requests", () => {
    const options = {
      host: "0.0.0.0",
      authToken: "secret",
      allowedOrigins: ["https://trusted.test"],
    };

    expect(
      isAuthorizedRequest(
        request({
          host: "example.test",
          origin: "https://trusted.test",
          authorization: "Bearer secret",
        }),
        options,
      ),
    ).toBe(true);
    expect(
      isAuthorizedRequest(
        request({ host: "example.test", origin: "https://trusted.test" }),
        options,
      ),
    ).toBe(false);
  });
});
