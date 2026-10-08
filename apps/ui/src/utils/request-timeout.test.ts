import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_REQUEST_TIMEOUT_MS, withRequestTimeout } from "./request-timeout";

describe("withRequestTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects a request that does not settle within its deadline", async () => {
    vi.useFakeTimers();
    const request = new Promise<never>(() => {});
    const result = withRequestTimeout(request, "Account request timed out.");
    const rejection = expect(result).rejects.toThrow("Account request timed out.");

    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);

    await rejection;
  });
});
