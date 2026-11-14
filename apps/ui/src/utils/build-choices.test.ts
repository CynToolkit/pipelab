import { describe, expect, it } from "vitest";
import type { ReleaseConfig } from "@pipelab/shared";
import type { CompatibleBuildCandidate } from "../pages/release-flow-model";
import {
  buildChoiceAlreadyAdded,
  buildChoicePlatform,
  filterBuildChoices,
  groupBuildChoices,
} from "./build-choices";

const choice = (engine: string, engineLabel: string, target: string): CompatibleBuildCandidate => ({
  type: "desktop",
  engine,
  target,
  typeLabel: "Desktop",
  engineLabel,
  targetLabel: target,
});

const choices = [
  choice("electron", "Electron", "windows-x64"),
  choice("electron", "Electron", "linux-arm64"),
  choice("electron", "Electron", "macos-arm64"),
  choice("tauri", "Tauri", "windows-x64"),
  choice("tauri", "Tauri", "linux-x64"),
];
const none = { query: "", engine: "", platform: "" } as const;

describe("build choices", () => {
  it("derives the platform from the target id", () => {
    expect(choices.map(buildChoicePlatform)).toEqual([
      "windows",
      "linux",
      "macos",
      "windows",
      "linux",
    ]);
    expect(buildChoicePlatform(choice("x", "X", "wasm"))).toBe("other");
  });

  it("filters by engine, platform and every search word", () => {
    expect(filterBuildChoices(choices, none)).toHaveLength(5);
    expect(filterBuildChoices(choices, { ...none, engine: "tauri" })).toHaveLength(2);
    expect(filterBuildChoices(choices, { ...none, platform: "windows" })).toHaveLength(2);
    expect(
      filterBuildChoices(choices, { query: "electron arm", engine: "", platform: "" }).map(
        (item) => item.target,
      ),
    ).toEqual(["linux-arm64", "macos-arm64"]);
    expect(filterBuildChoices(choices, { query: "  ", engine: "", platform: "" })).toHaveLength(5);
    expect(
      filterBuildChoices(choices, { query: "tauri", engine: "electron", platform: "" }),
    ).toEqual([]);
  });

  it("groups by engine in first-seen order", () => {
    const groups = groupBuildChoices(choices);

    expect(groups.map((group) => [group.engineLabel, group.choices.length])).toEqual([
      ["Electron", 3],
      ["Tauri", 2],
    ]);
  });

  it("recognises a build the workflow already has for the same engine, type and target", () => {
    const flow = {
      builds: [
        {
          id: "b1",
          type: "desktop",
          engine: "electron",
          config: {},
          targets: [
            { id: "windows-x64", config: {} },
            { id: "linux-arm64", config: {} },
          ],
        },
      ],
      destinations: [
        {
          id: "d",
          provider: "p",
          enabled: true,
          config: {},
          slots: [
            {
              id: "s",
              enabled: true,
              config: {},
              input: { buildId: "b1", targetId: "windows-x64" },
            },
          ],
        },
      ],
    } as unknown as ReleaseConfig;

    expect(buildChoiceAlreadyAdded(flow, choices[0]!)).toBe(true);
    expect(buildChoiceAlreadyAdded(flow, choices[1]!)).toBe(false);
    expect(buildChoiceAlreadyAdded(flow, choices[3]!)).toBe(false);
    expect(buildChoiceAlreadyAdded(undefined, choices[0]!)).toBe(false);
  });
});
