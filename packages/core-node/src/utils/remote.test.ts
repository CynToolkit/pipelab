import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { isOnline, fetchPackage, fetchPipelabPlugin } from "./remote";
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

  test("fetchPipelabPlugin maps latest to releaseTag for official plugins", async () => {
    vi.advanceTimersByTime(30000); // Bypass 10s caching
    const context = new PipelabContext({
      userDataPath: "/tmp/pipelab-test-remote",
      releaseTag: "beta",
    });
    const pluginName = "@pipelab/plugin-poki";
    const packageBaseDir = context.getPackagesPath(pluginName);
    const cachedVersionDir = path.join(packageBaseDir, "1.0.0-beta.15");

    vi.spyOn(dns, "lookup").mockResolvedValue({ address: "1.2.3.4", family: 4 } as any);

    vi.mocked(pacote.packument).mockResolvedValue({
      name: pluginName,
      versions: {
        "1.0.0-beta.15": {},
      },
      "dist-tags": {
        beta: "1.0.0-beta.15",
      },
    } as any);

    await fs.mkdir(cachedVersionDir, { recursive: true });
    await fs.writeFile(
      path.join(cachedVersionDir, "package.json"),
      JSON.stringify({
        name: pluginName,
        version: "1.0.0-beta.15",
        main: "dist/index.mjs",
      }),
    );

    const result = await fetchPipelabPlugin(pluginName, "latest", { context });

    expect(pacote.packument).toHaveBeenCalledWith(pluginName, expect.any(Object));
    expect(result.packageDir).toBe(cachedVersionDir);
  });

  test("fetchPipelabPlugin maps latest to releaseTag for custom plugins and falls back to latest if tag is missing", async () => {
    vi.advanceTimersByTime(40000); // Bypass 10s caching
    const context = new PipelabContext({
      userDataPath: "/tmp/pipelab-test-remote-custom",
      releaseTag: "beta",
    });
    const pluginName = "custom-cool-plugin";
    const packageBaseDir = context.getPackagesPath(pluginName);
    const cachedVersionDir = path.join(packageBaseDir, "2.0.0");

    vi.spyOn(dns, "lookup").mockResolvedValue({ address: "1.2.3.4", family: 4 } as any);

    vi.mocked(pacote.packument).mockResolvedValue({
      name: pluginName,
      versions: {
        "2.0.0": {},
      },
      "dist-tags": {
        latest: "2.0.0",
      },
    } as any);

    await fs.mkdir(cachedVersionDir, { recursive: true });
    await fs.writeFile(
      path.join(cachedVersionDir, "package.json"),
      JSON.stringify({
        name: pluginName,
        version: "2.0.0",
        main: "dist/index.mjs",
      }),
    );

    const result = await fetchPipelabPlugin(pluginName, "latest", { context });

    expect(pacote.packument).toHaveBeenCalledWith(pluginName, expect.any(Object));
    expect(result.packageDir).toBe(cachedVersionDir);
  });

  test("fetchPipelabPlugin maps latest to releaseTag for custom plugins and falls back to latest if beta is stale", async () => {
    vi.advanceTimersByTime(50000); // Bypass 10s caching
    const context = new PipelabContext({
      userDataPath: "/tmp/pipelab-test-remote-stale",
      releaseTag: "beta",
    });
    const pluginName = "stale-beta-plugin";
    const packageBaseDir = context.getPackagesPath(pluginName);
    const cachedVersionDir = path.join(packageBaseDir, "2.0.0");

    vi.spyOn(dns, "lookup").mockResolvedValue({ address: "1.2.3.4", family: 4 } as any);

    vi.mocked(pacote.packument).mockResolvedValue({
      name: pluginName,
      versions: {
        "1.0.0-beta.1": {},
        "2.0.0": {},
      },
      "dist-tags": {
        beta: "1.0.0-beta.1",
        latest: "2.0.0",
      },
    } as any);

    await fs.mkdir(cachedVersionDir, { recursive: true });
    await fs.writeFile(
      path.join(cachedVersionDir, "package.json"),
      JSON.stringify({
        name: pluginName,
        version: "2.0.0",
        main: "dist/index.mjs",
      }),
    );

    const result = await fetchPipelabPlugin(pluginName, "latest", { context });

    expect(pacote.packument).toHaveBeenCalledWith(pluginName, expect.any(Object));
    expect(result.packageDir).toBe(cachedVersionDir);
  });
});
