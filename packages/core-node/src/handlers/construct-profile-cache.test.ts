import { describe, expect, it, vi } from "vitest";
import type { BrowserProfileCandidate } from "@pipelab/shared";
import { ConstructProfileDiscoveryCache } from "./construct-profile-cache";

const profile = (path: string): BrowserProfileCandidate => ({
  browser: "Chrome",
  profileName: path.split(/[\\/]/).at(-1) || path,
  path,
  isDefault: false,
  addonCount: 2,
  authStatus: "authenticated",
  lastUpdatedAt: 100,
  score: 10,
  usable: true,
});

describe("ConstructProfileDiscoveryCache", () => {
  it("reuses discovered profile details until an explicit refresh", async () => {
    const discover = vi.fn(async () => [profile("/browser/Default")]);
    const cache = new ConstructProfileDiscoveryCache(discover, async (path) => profile(path));

    await cache.get();
    await cache.get();

    expect(discover).toHaveBeenCalledTimes(1);
  });

  it("replaces cached profile details when refresh is requested", async () => {
    const discover = vi
      .fn<() => Promise<BrowserProfileCandidate[]>>()
      .mockResolvedValueOnce([profile("/browser/old")])
      .mockResolvedValueOnce([profile("/browser/new")]);
    const cache = new ConstructProfileDiscoveryCache(discover, async (path) => profile(path));

    expect((await cache.get()).map((item) => item.path)).toEqual(["/browser/old"]);
    expect((await cache.get(undefined, true)).map((item) => item.path)).toEqual(["/browser/new"]);
  });

  it("coalesces concurrent cold-cache scans", async () => {
    let finishScan!: (profiles: BrowserProfileCandidate[]) => void;
    const discover = vi.fn(
      () => new Promise<BrowserProfileCandidate[]>((resolve) => (finishScan = resolve)),
    );
    const cache = new ConstructProfileDiscoveryCache(discover, async (path) => profile(path));

    const first = cache.get();
    const second = cache.get();
    finishScan([profile("/browser/Default")]);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it("inspects a manually selected profile absent from discovery and remembers it", async () => {
    const discover = vi.fn(async () => [profile("/browser/Default")]);
    const inspect = vi.fn(async (path: string) => profile(path));
    const cache = new ConstructProfileDiscoveryCache(discover, inspect);

    expect((await cache.get("/custom/Pipelab")).map((item) => item.path)).toEqual([
      "/custom/Pipelab",
      "/browser/Default",
    ]);
    await cache.get("/custom/Pipelab");

    expect(inspect).toHaveBeenCalledTimes(1);
  });
});
