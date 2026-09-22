import { describe, expect, it } from "vitest";
import {
  buildEnginesFor,
  buildProfileSummary,
  buildTargetsFor,
  applyProducerInspection,
  createBuildProfile,
  createSerializedTaskQueue,
  issuesForPath,
  planOutputOptions,
  switchBuildProfileEngine,
} from "./release-flow-model";
import type { ReleaseCatalog, ReleaseConfig, ReleasePlan } from "@pipelab/shared";

const catalog: ReleaseCatalog = {
  buildTypes: [
    { id: "desktop", label: "Desktop" },
    { id: "web", label: "Web" },
  ],
  sources: [
    {
      id: "source",
      label: "Project",
      output: { kind: "project", container: "directory" },
      defaultConfig: {},
    },
  ],
  producers: [
    {
      id: "engine-a",
      label: "Engine A",
      accepts: {},
      planning: { mode: "build" },
      defaultConfig: { preset: "default" },
      targets: [
        { id: "windows", label: "Windows x64", buildType: "desktop", defaultConfig: {} },
        { id: "macos", label: "macOS", buildType: "desktop", defaultConfig: {} },
        { id: "web", label: "Web", buildType: "web", defaultConfig: {} },
      ],
    },
    {
      id: "engine-b",
      label: "Engine B",
      accepts: {},
      planning: { mode: "build" },
      defaultConfig: { preset: "b-default" },
      targets: [{ id: "linux", label: "Linux x64", buildType: "desktop", defaultConfig: {} }],
    },
    {
      id: "automatic-unzip",
      label: "Unzip",
      accepts: {},
      planning: { mode: "automatic" },
      defaultConfig: {},
      targets: [{ id: "directory", label: "Directory", buildType: "desktop", defaultConfig: {} }],
    },
  ],
  destinations: [],
};

const config: ReleaseConfig = {
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: "source", config: {} },
  builds: [],
  destinations: [],
};

describe("release flow model", () => {
  it("provides the compact build-card summary without inline settings", () => {
    const build = createBuildProfile(catalog, "desktop", "engine-a", "desktop-one")!;
    expect(buildProfileSummary(catalog, build)).toEqual({
      engineLabel: "Engine A",
      targetLabels: ["Windows x64"],
    });
    expect(build.targets).toEqual([
      { id: "windows", enabled: true, config: {} },
      { id: "macos", enabled: false, config: {} },
    ]);
  });

  it("serializes autosave requests and keeps the latest request", async () => {
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    const queue = createSerializedTaskQueue(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          if (calls === 1) releaseFirst = resolve;
          else resolve();
        }),
    );

    const first = queue();
    const second = queue();
    expect(second).toBe(first);
    expect(calls).toBe(1);
    releaseFirst?.();
    await first;
    expect(calls).toBe(2);
  });

  it("shows only build engines and targets for the selected type", () => {
    expect(buildEnginesFor(catalog, "desktop").map((engine) => engine.id)).toEqual([
      "engine-a",
      "engine-b",
    ]);
    expect(buildTargetsFor(catalog, "engine-a", "desktop").map((target) => target.id)).toEqual([
      "windows",
      "macos",
    ]);
    expect(buildTargetsFor(catalog, "engine-a", "web").map((target) => target.id)).toEqual(["web"]);
  });

  it("creates independent profiles for repeated build types", () => {
    const first = createBuildProfile(catalog, "desktop", "engine-a", "desktop-one");
    const second = createBuildProfile(catalog, "desktop", "engine-a", "desktop-two");
    expect(first?.id).toBe("desktop-one");
    expect(second?.id).toBe("desktop-two");
    expect(first).not.toBe(second);
  });

  it("renders explicit outputs from the planner without compatibility logic", () => {
    const plan = {
      outputs: [
        {
          ref: { source: true },
          artifactRef: { source: true },
          descriptor: { kind: "project", container: "directory" },
        },
      ],
      issues: [],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(planOutputOptions(config, plan, catalog)).toEqual([
      { value: "source", label: "Source — Project", ref: { source: true } },
    ]);
  });

  it("preserves the profile id and compatible settings while dropping invalid targets", () => {
    const build = {
      ...createBuildProfile(catalog, "desktop", "engine-a", "desktop-one")!,
      config: { preset: "custom" },
    };
    const switched = switchBuildProfileEngine(catalog, build, "engine-b");
    expect(switched).toMatchObject({
      id: "desktop-one",
      engine: "engine-b",
      config: { preset: "custom" },
    });
    expect(switched?.targets.map((target) => target.id)).toEqual(["linux"]);
  });

  it("maps planner diagnostics to the relevant field", () => {
    const issues = [
      {
        code: "release.destination.input.invalid",
        message: "Invalid output",
        severity: "error" as const,
        path: "destinations.0.slots.0.input",
      },
    ];
    expect(issuesForPath(issues, "destinations.0")).toEqual(issues);
    expect(issuesForPath(issues, "builds.0")).toEqual([]);
  });

  it("applies producer inspection values and indexed issues", () => {
    const build = createBuildProfile(catalog, "desktop", "engine-a", "desktop-one")!;
    const result = applyProducerInspection(build, 2, {
      fieldValues: { "targets.windows.config.preset": "release" },
      fieldOptions: { preset: [{ label: "Release", value: "release" }] },
      issues: [
        {
          code: "preset.required",
          message: "Choose a preset",
          severity: "error",
          path: "targets.windows.config.preset",
        },
      ],
    });
    expect(build.targets[0].config.preset).toBe("release");
    expect(result.options.preset).toEqual([{ label: "Release", value: "release" }]);
    expect(result.issues[0].path).toBe("builds.2.targets.0.config.preset");
  });
});
