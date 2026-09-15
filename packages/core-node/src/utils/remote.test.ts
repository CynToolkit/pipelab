import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { isOnline, fetchPackage } from "./remote";
import dns from "node:dns/promises";
import pacote from "pacote";
import { vol } from "memfs";
import { PipelabContext } from "../context";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

vi.mock("node:fs", async () => {
  const memfs = await import("memfs");
  return {
    ...memfs.fs,
    default: memfs.fs,
    existsSync: (p: string) => memfs.fs.existsSync(p),
  };
});

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return {
    ...memfs.fs.promises,
    default: memfs.fs.promises,
  };
});

vi.mock("pacote", () => ({
  default: {
    packument: vi.fn(),
    extract: vi.fn(),
  },
}));

describe("remote utilities & offline mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vol.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("isOnline returns true when dns.lookup succeeds", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue({ address: "1.2.3.4", family: 4 } as any);
    const online = await isOnline();
    expect(online).toBe(true);
  });

  test("isOnline returns false when dns.lookup throws", async () => {
    vi.advanceTimersByTime(11000); // Bypass 10s caching
    vi.spyOn(dns, "lookup").mockRejectedValue(new Error("ENOTFOUND"));
    const online = await isOnline();
    expect(online).toBe(false);
  });

  test("fetchPackage falls back to local packages when offline", async () => {
    // 1. Force offline status
    vi.advanceTimersByTime(11000); // Bypass 10s caching
    vi.spyOn(dns, "lookup").mockRejectedValue(new Error("Offline"));

    const context = new PipelabContext({ userDataPath: "/tmp/pipelab-test-remote" });
    const packageName = "my-plugin";
    const packageBaseDir = context.getPackagesPath(packageName);
    const cachedVersionDir = path.join(packageBaseDir, "1.0.0");

    await fs.mkdir(cachedVersionDir, { recursive: true });
    await fs.writeFile(
      path.join(cachedVersionDir, "package.json"),
      JSON.stringify({
        name: packageName,
        version: "1.0.0",
        main: "index.mjs",
      }),
    );

    // 2. Call fetchPackage
    const result = await fetchPackage(packageName, "latest", { context });

    // 3. Verify it resolved to local cached version without calling pacote
    expect(result.resolvedVersion).toBe("1.0.0");
    expect(result.packageDir).toBe(cachedVersionDir);
    expect(pacote.packument).not.toHaveBeenCalled();
  });

  test("rejects Pipelab packages because the released CLI bundles them", async () => {
    const context = new PipelabContext({ userDataPath: "/tmp/pipelab-test-remote" });

    await expect(fetchPackage("@pipelab/plugin-poki", "latest", { context })).rejects.toThrow(
      "must be provided by the CLI bundle",
    );
    expect(pacote.packument).not.toHaveBeenCalled();
  });
});
