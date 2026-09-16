import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForUiDevServer } from "./server";

describe("waitForUiDevServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for a UI that is starting in another dev task", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce(new Response("ok"));

    await expect(waitForUiDevServer({ timeoutMs: 100, intervalMs: 1 })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
