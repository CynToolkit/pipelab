import { describe, expect, it } from "vitest";
import { usedTargetKeys } from "./usage";
import type { ReleaseConfig } from "./types";

const base = (): ReleaseConfig => ({
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: "source", config: {} },
  builds: [
    {
      id: "a",
      type: "desktop",
      engine: "e",
      config: {},
      targets: [
        { id: "win", config: {} },
        { id: "linux", config: {} },
        { id: "mac", config: {} },
      ],
    },
  ],
  destinations: [
    {
      id: "d",
      provider: "p",
      enabled: true,
      config: {},
      slots: [{ id: "s", enabled: true, input: { buildId: "a", targetId: "win" }, config: {} }],
    },
  ],
});

describe("usedTargetKeys", () => {
  it("returns only the targets an active slot reads", () => {
    expect([...usedTargetKeys(base())]).toEqual(["a:win"]);
  });

  it("ignores disabled slots and disabled destinations", () => {
    const slotOff = base();
    slotOff.destinations[0].slots[0].enabled = false;
    expect(usedTargetKeys(slotOff).size).toBe(0);
    const destinationOff = base();
    destinationOff.destinations[0].enabled = false;
    expect(usedTargetKeys(destinationOff).size).toBe(0);
  });

  it("includes inputs of enabled builds and excludes those of disabled builds", () => {
    const config = base();
    config.builds.push({
      id: "b",
      type: "bundle",
      engine: "bundle",
      config: {},
      inputs: [{ buildId: "a", targetId: "linux" }, { source: true }],
      targets: [],
    });
    expect([...usedTargetKeys(config)].sort()).toEqual(["a:linux", "a:win"]);
  });
});
