import { describe, expect, it } from "vitest";
import {
  buildEnginesFor,
  buildTargetsFor,
  createBuildProfile,
  createSerializedTaskQueue,
  defaultBuildProfile,
  issuesForPath,
  planOutputOptions,
  removeBuildProfile,
  resolveMissingDestinationInputs,
  switchBuildProfileEngine,
} from "./release-flow-model";
import type {
  ReleaseBuildPreferences,
  ReleaseCatalog,
  ReleaseConfig,
  ReleasePlan,
} from "@pipelab/shared";

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

  it("keeps generated profiles editable and removable", () => {
    const editable = defaultBuildProfile(catalog, "desktop", "desktop-default", {
      buildTypes: { desktop: { engine: "engine-a", targets: ["windows"] } },
    });
    expect(editable).toBeDefined();
    expect(switchBuildProfileEngine(catalog, editable!, "engine-b")?.id).toBe("desktop-default");

    const configWithGenerated: ReleaseConfig = {
      ...config,
      builds: [editable!],
    };
    expect(removeBuildProfile(configWithGenerated, "desktop-default")).toBe(true);
    expect(configWithGenerated.builds).toEqual([]);
    expect(removeBuildProfile(configWithGenerated, "desktop-default")).toBe(false);
  });

  it("creates a profile from explicit build preferences", () => {
    const preferences: ReleaseBuildPreferences = {
      buildTypes: { desktop: { engine: "engine-b", targets: ["linux"] } },
    };
    expect(defaultBuildProfile(catalog, "desktop", "desktop-default", preferences)).toMatchObject({
      id: "desktop-default",
      engine: "engine-b",
      targets: [{ id: "linux", enabled: true }],
    });
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

  it("routes an unresolved destination to an existing compatible output", () => {
    const destinationCatalog = {
      ...catalog,
      destinations: [
        {
          id: "desktop-destination",
          label: "Desktop destination",
          accepts: { kind: "project" },
          defaultConfig: {},
        },
      ],
    };
    const configWithDestination: ReleaseConfig = {
      ...config,
      builds: [],
      destinations: [
        {
          id: "destination",
          provider: "desktop-destination",
          enabled: true,
          config: {},
          slots: [{ id: "default", enabled: true, config: {} }],
        },
      ],
    };
    const plan = {
      outputs: [
        {
          ref: { source: true },
          artifactRef: { source: true },
          descriptor: { kind: "project", container: "directory" },
        },
      ],
      issues: [
        {
          code: "release.destination.input.required",
          message: "Choose an output.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
      ],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(
      resolveMissingDestinationInputs(configWithDestination, plan, destinationCatalog, {
        buildTypes: {},
      }),
    ).toBe(true);
    expect(configWithDestination.destinations[0].slots[0].input).toEqual({ source: true });
    expect(configWithDestination.builds).toHaveLength(0);
  });

  it("creates one configured default build when no compatible output exists", () => {
    const buildCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          ...catalog.producers[0],
          targets: [
            {
              ...catalog.producers[0].targets[0],
              output: { kind: "application", platform: "windows", container: "directory" },
            },
          ],
        },
      ],
      destinations: [
        {
          id: "desktop-destination",
          label: "Desktop destination",
          accepts: { kind: "application", platform: "windows", container: "directory" },
          defaultConfig: {},
        },
      ],
    };
    const configWithDestination: ReleaseConfig = {
      ...config,
      builds: [],
      destinations: [
        {
          id: "destination",
          provider: "desktop-destination",
          enabled: true,
          config: {},
          slots: [{ id: "default", enabled: true, config: {} }],
        },
      ],
    };
    const plan = {
      outputs: [],
      issues: [
        {
          code: "release.destination.input.required",
          message: "Choose an output.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
      ],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(
      resolveMissingDestinationInputs(configWithDestination, plan, buildCatalog, {
        buildTypes: { desktop: { engine: "engine-a", targets: ["windows"] } },
      }),
    ).toBe(true);
    expect(configWithDestination.builds).toHaveLength(1);
    expect(configWithDestination.builds[0]).toMatchObject({
      id: "desktop-default",
      engine: "engine-a",
    });
    expect(configWithDestination.destinations[0].slots[0].input).toEqual({
      buildId: "desktop-default",
      targetId: "windows",
    });
  });

  it("creates the Desktop fallback for Construct to Steam", () => {
    const buildCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          ...catalog.producers[0],
          id: "@pipelab/plugin-electron/producer",
          targets: [
            {
              ...catalog.producers[0].targets[0],
              id: "windows-x64",
              output: { kind: "application", platform: "windows", container: "directory" },
            },
          ],
        },
      ],
      destinations: [
        {
          id: "steam",
          label: "Steam",
          accepts: { kind: "application", platform: "windows", container: "directory" },
          defaultConfig: {},
        },
      ],
    };
    const configWithDestination: ReleaseConfig = {
      ...config,
      builds: [],
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: "/game.c3p", profilePath: "/profile" },
      },
      destinations: [
        {
          id: "steam",
          provider: "steam",
          enabled: true,
          config: {},
          slots: [{ id: "windows", enabled: true, config: {} }],
        },
      ],
    };
    const plan = {
      outputs: [],
      issues: [
        {
          code: "release.destination.input.required",
          message: "Choose an output.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
      ],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(
      resolveMissingDestinationInputs(configWithDestination, plan, buildCatalog, {
        buildTypes: {},
      }),
    ).toBe(true);
    expect(configWithDestination.builds[0]).toMatchObject({
      engine: "@pipelab/plugin-electron/producer",
      targets: [{ id: "windows-x64", enabled: true }],
    });
  });

  it("creates one Desktop build for Construct to Steam and Poki", () => {
    const destinationCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          ...catalog.producers[0],
          id: "@pipelab/plugin-electron/producer",
          targets: [
            {
              ...catalog.producers[0].targets[0],
              id: "windows-x64",
              output: { kind: "application", platform: "windows", container: "directory" },
            },
          ],
        },
      ],
      destinations: [
        {
          id: "@pipelab/plugin-steam/destination",
          label: "Steam",
          accepts: { kind: "application", platform: "windows", container: "directory" },
          defaultConfig: {},
        },
        {
          id: "@pipelab/plugin-poki/destination",
          label: "Poki",
          accepts: { kind: "application", platform: "web", container: "directory" },
          defaultConfig: {},
        },
      ],
    };
    const configWithDestinations: ReleaseConfig = {
      ...config,
      builds: [],
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: "/game.c3p", profilePath: "/profile" },
      },
      destinations: [
        {
          id: "first",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: {},
          slots: [{ id: "slot", enabled: true, config: {} }],
        },
        {
          id: "second",
          provider: "@pipelab/plugin-poki/destination",
          enabled: true,
          config: {},
          slots: [{ id: "slot", enabled: true, config: {} }],
        },
      ],
    };
    const plan = {
      outputs: [
        {
          ref: { source: true },
          artifactRef: { source: true },
          descriptor: { kind: "application", platform: "web", container: "directory" },
        },
      ],
      issues: [
        {
          code: "release.destination.input.required",
          message: "Choose an output.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
        {
          code: "release.destination.input.required",
          message: "Choose an output.",
          severity: "error" as const,
          path: "destinations.1.slots.0.input",
        },
      ],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(
      resolveMissingDestinationInputs(configWithDestinations, plan, destinationCatalog, {
        buildTypes: {},
      }),
    ).toBe(true);
    expect(configWithDestinations.builds).toHaveLength(1);
    expect(configWithDestinations.destinations[0].slots[0].input).toEqual({
      buildId: "desktop-default",
      targetId: "windows-x64",
    });
    expect(configWithDestinations.destinations[1].slots[0].input).toEqual({
      source: true,
    });
  });

  it("does not recreate a build after the user removes its referenced profile", () => {
    const destinationCatalog: ReleaseCatalog = {
      ...catalog,
      destinations: [
        {
          id: "desktop-destination",
          label: "Desktop destination",
          accepts: { kind: "application", platform: "windows", container: "directory" },
          defaultConfig: {},
        },
      ],
    };
    const configAfterRemoval: ReleaseConfig = {
      ...config,
      builds: [],
      destinations: [
        {
          id: "destination",
          provider: "desktop-destination",
          enabled: true,
          config: {},
          slots: [
            {
              id: "default",
              enabled: true,
              input: { buildId: "desktop-default", targetId: "windows" },
              config: {},
            },
          ],
        },
      ],
    };
    const plan = {
      outputs: [],
      issues: [
        {
          code: "release.destination.input.invalid",
          message: "The selected build output no longer exists.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
      ],
      producers: [],
      destinations: [],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    expect(
      resolveMissingDestinationInputs(configAfterRemoval, plan, destinationCatalog, {
        buildTypes: { desktop: { engine: "engine-a", targets: ["windows"] } },
      }),
    ).toBe(false);
    expect(configAfterRemoval.builds).toEqual([]);
    expect(configAfterRemoval.destinations[0].slots[0].input).toEqual({
      buildId: "desktop-default",
      targetId: "windows",
    });
  });
});
