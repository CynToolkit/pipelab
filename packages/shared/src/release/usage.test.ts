import { describe, expect, it } from "vitest";
import { forEachUsedValue, usedSelectionFromConfig, usedTargetKeys } from "./usage";
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

describe("forEachUsedValue", () => {
  const field = (key: string) => ({ key });
  const definitions = {
    sources: [{ id: "source", fields: [field("path")] }],
    producers: [
      {
        id: "engine",
        fields: [field("note")],
        targets: [
          { id: "win", fields: [field("out")] },
          { id: "linux", fields: [field("out")] },
        ],
      },
    ],
    destinations: [{ id: "store", fields: [field("project")], slotFields: [field("channel")] }],
  };
  const config = (): ReleaseConfig => ({
    ...base(),
    source: { provider: "source", config: { path: "src" } },
    builds: [
      {
        id: "a",
        type: "desktop",
        engine: "engine",
        config: { note: "a-note" },
        targets: [
          { id: "win", config: { out: "a-win" } },
          { id: "linux", config: { out: "a-linux" } },
        ],
      },
      {
        id: "unused",
        type: "desktop",
        engine: "engine",
        config: { note: "unused-note" },
        targets: [{ id: "win", config: { out: "unused-win" } }],
      },
    ],
    destinations: [
      {
        id: "d",
        provider: "store",
        enabled: true,
        config: { project: "p" },
        slots: [
          {
            id: "on",
            enabled: true,
            input: { buildId: "a", targetId: "win" },
            config: { channel: "c" },
          },
          { id: "off", enabled: false, config: { channel: "off-channel" } },
        ],
      },
      {
        id: "disabled",
        provider: "store",
        enabled: false,
        config: { project: "disabled-project" },
        slots: [{ id: "s", enabled: true, config: { channel: "disabled-channel" } }],
      },
    ],
  });
  const visitedValues = (selection: Parameters<typeof forEachUsedValue>[1]) => {
    const seen: unknown[] = [];
    forEachUsedValue(config(), selection, definitions, (_field, value) => seen.push(value));
    return seen;
  };

  it("reads only what the selection uses: used targets, builds something reads, enabled slots", () => {
    expect(visitedValues(usedSelectionFromConfig(config()))).toEqual([
      "src",
      "a-note",
      "a-win",
      "p",
      "c",
    ]);
  });

  it("reads the same values from a plan-shaped selection", () => {
    expect(
      visitedValues({
        producers: [
          {
            provider: "engine",
            config: { note: "a-note" },
            targets: [{ id: "win", enabled: true, config: { out: "a-win" } }],
          },
        ],
        destinations: [
          {
            provider: "store",
            config: { project: "p" },
            slots: [{ enabled: true, config: { channel: "c" } }],
          },
        ],
      }),
    ).toEqual(["src", "a-note", "a-win", "p", "c"]);
  });
});
