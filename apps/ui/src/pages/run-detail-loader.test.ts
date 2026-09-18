import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRunEntryWithRetry } from "./run-detail-loader";

afterEach(() => vi.useRealTimers());

describe("loadRunEntryWithRetry", () => {
  it("waits through an initial miss and returns a newly persisted live run", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const load = loadRunEntryWithRetry(async () => {
      attempts++;
      return attempts < 3 ? undefined : { id: "run-1" };
    });

    await vi.advanceTimersByTimeAsync(500);

    await expect(load).resolves.toEqual({ id: "run-1" });
    expect(attempts).toBe(3);
  });

  it("returns missing after the bounded retry window", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => undefined);
    const load = loadRunEntryWithRetry(read);

    await vi.runAllTimersAsync();

    await expect(load).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(5);
  });

  it("stops retrying when the detail route is no longer active", async () => {
    const read = vi.fn(async () => undefined);
    const shouldContinue = vi.fn(() => false);

    await expect(loadRunEntryWithRetry(read, 4, 250, shouldContinue)).resolves.toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});
