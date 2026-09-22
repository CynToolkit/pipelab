import { describe, expect, it } from "vitest";
import {
  buildEnginesFor,
  buildProfileSummary,
  buildTargetsFor,
  applyProducerInspection,
  connectionMatchesIntegration,
  createBuildProfile,
  createSerializedTaskQueue,
  issuesForPath,
  planOutputOptions,
  plannerAcceptsBuildCandidate,
  deploymentSlotLabel,
  readinessLabel,
  releaseCanRun,
  setBuildTargetEnabled,
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

  it("allows an auto-created profile to toggle its targets", () => {
    const build = createBuildProfile(catalog, "desktop", "engine-a", "generated-profile")!;
    expect(build.targets.map((target) => target.enabled)).toEqual([true, false]);

    expect(setBuildTargetEnabled(build, "macos", true)).toBe(true);
    expect(build.targets.map((target) => target.enabled)).toEqual([true, true]);

    expect(setBuildTargetEnabled(build, "windows", false)).toBe(true);
    expect(build.targets.map((target) => target.enabled)).toEqual([false, true]);
    expect(setBuildTargetEnabled(build, "missing", true)).toBe(false);
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

  it("accepts only planner-resolved compatible build candidates", () => {
    const basePlan = {
      outputs: [],
      producers: [{ id: "candidate" }],
      destinations: [],
      issues: [],
      graph: { nodes: [], edges: [] },
    } as unknown as ReleasePlan;
    expect(plannerAcceptsBuildCandidate(basePlan, "candidate", 1, 0, 0)).toBe(true);
    expect(
      plannerAcceptsBuildCandidate(
        {
          ...basePlan,
          issues: [
            {
              code: "release.destination.input.incompatible",
              message: "No route",
              severity: "error",
              path: "destinations.0.slots.0.input",
            },
          ],
        },
        "candidate",
        1,
        0,
        0,
      ),
    ).toBe(false);
  });

  it("matches a newly saved connection by plugin integration", () => {
    const connection = {
      id: "steam-account",
      pluginName: "@pipelab/plugin-steam",
      integrationName: "Steam Account",
      name: "Build account",
      username: "steam-user",
      password: "secret",
      createdAt: new Date().toISOString(),
      isDefault: false,
    } as never;
    expect(connectionMatchesIntegration(connection, "@pipelab/plugin-steam")).toBe(true);
    expect(connectionMatchesIntegration(connection, "@pipelab/plugin-itch")).toBe(false);
  });

  it("only allows shipping a fully planned release without blocking issues", () => {
    const flow = {} as ReleaseConfig;
    const plan = { issues: [] } as unknown as ReleasePlan;
    expect(releaseCanRun(flow, plan, [], false, false)).toBe(true);
    expect(releaseCanRun(flow, undefined, [], false, false)).toBe(false);
    expect(
      releaseCanRun(
        flow,
        plan,
        [{ code: "invalid", message: "Fix it", severity: "error" }],
        false,
        false,
      ),
    ).toBe(false);
    expect(
      releaseCanRun(
        flow,
        plan,
        [{ code: "warn", message: "Review it", severity: "warning" }],
        false,
        false,
      ),
    ).toBe(true);
    expect(releaseCanRun(flow, plan, [], true, false)).toBe(false);
    expect(releaseCanRun(flow, plan, [], false, true)).toBe(false);
  });

  it("uses a deployment name with a friendly fallback", () => {
    expect(
      deploymentSlotLabel({ id: "opaque", enabled: true, config: {}, name: "Windows build" }, 0),
    ).toBe("Windows build");
    expect(deploymentSlotLabel({ id: "opaque", enabled: true, config: {} }, 1)).toBe(
      "Deployment 2",
    );
  });

  it("labels destination readiness consistently", () => {
    expect(readinessLabel(true, true, false)).toBe("Ready");
    expect(readinessLabel(true, false, false)).toBe("Needs attention");
    expect(readinessLabel(true, true, true)).toBe("Needs attention");
    expect(readinessLabel(false, true, false)).toBe("Disabled");
  });
});
