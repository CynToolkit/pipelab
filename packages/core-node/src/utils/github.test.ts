import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchPackageReleases,
  fetchLatestPackageRelease,
  fetchLatestDesktopRelease,
} from "./github";

describe("GitHub Release Updates API", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
    // Clean up environment variables
    delete process.env.PIPELAB_OVERRIDE_RELEASE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetchPackageReleases - returns empty array when git matching-refs fails", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app");
    expect(releases).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("matching-refs/tags/%40pipelab%2Fapp"),
      expect.any(Object),
    );
  });

  test("fetchPackageReleases - returns empty array when no tags match package", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app");
    expect(releases).toEqual([]);
  });

  test("fetchPackageReleases - correctly filters prereleases when allowPrerelease is false", async () => {
    // 1. mock matching refs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { ref: "refs/tags/@pipelab/app@1.0.0-beta.1" },
        { ref: "refs/tags/@pipelab/app@1.0.0" },
      ],
    } as any);

    // 2. mock tag lookup for 1.0.0 (since 1.0.0-beta.1 is filtered out)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@1.0.0",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        html_url: "https://github.com/CynToolkit/pipelab/releases/tag/%40pipelab%2Fapp%401.0.0",
        assets: [],
      }),
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app", { allowPrerelease: false });
    expect(releases).toHaveLength(1);
    expect(releases[0].tag_name).toBe("@pipelab/app@1.0.0");
  });

  test("fetchPackageReleases - includes prereleases when allowPrerelease is true", async () => {
    // 1. mock matching refs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { ref: "refs/tags/@pipelab/app@1.0.0-beta.1" },
        { ref: "refs/tags/@pipelab/app@1.0.0" },
      ],
    } as any);

    // 2. mock tag lookup for 1.0.0 (since sorting puts 1.0.0 first)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@1.0.0",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        html_url: "https://github.com/CynToolkit/pipelab/releases/tag/%40pipelab%2Fapp%401.0.0",
        assets: [],
      }),
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app", { allowPrerelease: true });
    expect(releases).toHaveLength(1);
    expect(releases[0].tag_name).toBe("@pipelab/app@1.0.0");
  });

  test("fetchPackageReleases - handles tag that has no release (skips and falls back to older tag)", async () => {
    // 1. mock matching refs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { ref: "refs/tags/@pipelab/app@1.1.0" },
        { ref: "refs/tags/@pipelab/app@1.0.0" },
      ],
    } as any);

    // 2. mock tag lookup for 1.1.0 (returns 404 - no release yet, tag exists)
    fetchSpy.mockResolvedValueOnce({
      status: 404,
      ok: false,
      statusText: "Not Found",
    } as any);

    // 3. mock tag lookup for 1.0.0 (returns 200 - release exists)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@1.0.0",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        assets: [],
      }),
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app");
    expect(releases).toHaveLength(1);
    expect(releases[0].tag_name).toBe("@pipelab/app@1.0.0");
  });

  test("fetchPackageReleases - handles environment variable PIPELAB_OVERRIDE_RELEASE override", async () => {
    process.env.PIPELAB_OVERRIDE_RELEASE = "1.2.3";

    // Mock direct tag retrieval
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@1.2.3",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        assets: [],
      }),
    } as any);

    const releases = await fetchPackageReleases("@pipelab/app");
    expect(releases).toHaveLength(1);
    expect(releases[0].tag_name).toBe("@pipelab/app@1.2.3");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("releases/tags/%40pipelab%2Fapp%401.2.3"),
      expect.any(Object),
    );
  });

  test("fetchLatestPackageRelease - selects newest matching release", async () => {
    // Mock matching refs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { ref: "refs/tags/@pipelab/app@1.0.0" },
        { ref: "refs/tags/@pipelab/app@2.0.0" },
        { ref: "refs/tags/@pipelab/app@1.5.0" },
      ],
    } as any);

    // Mock release lookup for 2.0.0 (since 2.0.0 is highest version)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@2.0.0",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        assets: [],
      }),
    } as any);

    const latest = await fetchLatestPackageRelease("@pipelab/app");
    expect(latest).not.toBeNull();
    expect(latest?.tag_name).toBe("@pipelab/app@2.0.0");
  });

  test("fetchLatestDesktopRelease - queries the @pipelab/app package specifically", async () => {
    // Mock matching refs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ ref: "refs/tags/@pipelab/app@3.0.0" }],
    } as any);

    // Mock release lookup
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "@pipelab/app@3.0.0",
        prerelease: false,
        published_at: "2026-06-04T00:00:00Z",
        assets: [],
      }),
    } as any);

    const latest = await fetchLatestDesktopRelease();
    expect(latest).not.toBeNull();
    expect(latest?.tag_name).toBe("@pipelab/app@3.0.0");
  });
});
