import { describe, expect, it } from "vitest";
import { withoutHostUnavailableBuilds } from "./host-availability";
import type { ReleaseConfig, ReleaseRegistry } from "./types";

const registry = {
  producers: [
    {
      id: "engine",
      targets: [
        { id: "linux-x64" },
        {
          id: "macos-arm64",
          isAvailable: (host: { platform: string }) =>
            host.platform === "darwin" ? { available: true } : { available: false, reason: "no" },
        },
      ],
    },
  ],
} as unknown as ReleaseRegistry;

const config = {
  builds: [
    {
      id: "b",
      engine: "engine",
      targets: [
        { id: "linux-x64", enabled: true, config: {} },
        { id: "macos-arm64", enabled: true, config: {} },
      ],
    },
  ],
  destinations: [
    {
      id: "d",
      slots: [
        { id: "s1", enabled: true, input: { buildId: "b", targetId: "linux-x64" }, config: {} },
        { id: "s2", enabled: true, input: { buildId: "b", targetId: "macos-arm64" }, config: {} },
      ],
    },
  ],
} as unknown as ReleaseConfig;

describe("withoutHostUnavailableBuilds", () => {
  it("turns off unavailable targets and the deployments that take them", () => {
    const result = withoutHostUnavailableBuilds(config, registry, {
      platform: "linux",
      architecture: "x64",
    });
    expect(result.builds[0]?.targets.map((target) => target.enabled)).toEqual([true, false]);
    expect(result.destinations[0]?.slots.map((slot) => slot.enabled)).toEqual([true, false]);
  });

  it("leaves a config alone when every target is available", () => {
    expect(
      withoutHostUnavailableBuilds(config, registry, { platform: "darwin", architecture: "arm64" }),
    ).toBe(config);
  });
});
