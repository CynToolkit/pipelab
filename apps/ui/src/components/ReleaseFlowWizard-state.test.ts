import { describe, expect, it } from "vitest";
import type { ReleaseCatalog, ReleaseConfig, ReleasePlan } from "@pipelab/shared";
import {
  buildReleaseWizardConfig,
  createReleaseWizardDraft,
  createWizardRequestRevision,
  releaseWizardBuildSummaries,
  releaseWizardCreationConfig,
  releaseWizardNeedsAdditionalBuildSetup,
  releaseWizardResolutionIsPlannerValid,
  releaseWizardSourceIsReady,
} from "./ReleaseFlowWizard-state";

const catalog: ReleaseCatalog = {
  buildTypes: [],
  sources: [
    {
      id: "source/project",
      label: "Project",
      output: { kind: "project", container: "directory" },
      defaultConfig: {},
    },
  ],
  producers: [
    {
      id: "@pipelab/plugin-electron/producer",
      label: "Electron",
      accepts: { kind: "project" },
      planning: { mode: "build" },
      defaultConfig: {},
      targets: [
        { id: "windows-x64", label: "Windows x64", buildType: "desktop", defaultConfig: {} },
      ],
    },
  ],
  destinations: [
    {
      id: "destination/upload",
      label: "Upload",
      accepts: {},
      defaultConfig: {},
    },
  ],
};

const configWithBuild = (): ReleaseConfig => ({
  version: "3.0.0",
  id: "release-1",
  project: "project-1",
  name: "Release",
  source: { provider: "source/project", config: {} },
  builds: [
    {
      id: "desktop",
      type: "desktop",
      engine: "@pipelab/plugin-electron/producer",
      enabled: true,
      config: {},
      targets: [{ id: "windows-x64", enabled: true, config: {} }],
    },
  ],
  destinations: [
    {
      id: "upload",
      provider: "destination/upload",
      enabled: true,
      config: {},
      slots: [
        {
          id: "windows",
          enabled: true,
          config: {},
          input: { buildId: "desktop", targetId: "windows-x64" },
        },
      ],
    },
  ],
});

const plannerOutput = (input: { source: true } | { producerId: string; outputId: string }) =>
  ({
    producers: [
      {
        id: "desktop",
        provider: "producer/electron",
        enabled: true,
        targets: [],
        config: {},
      },
    ],
    outputs: [],
    destinations: [
      {
        id: "upload",
        provider: "destination/upload",
        enabled: true,
        config: {},
        slots: [{ id: "windows", enabled: true, config: {}, input }],
      },
    ],
    issues: [],
    graph: { nodes: [], edges: [] },
  }) satisfies ReleasePlan;

describe("ReleaseFlowWizard state", () => {
  it("starts without selecting a Source", () => {
    const draft = createReleaseWizardDraft();
    expect(draft.source.provider).toBe("");
    expect(releaseWizardSourceIsReady(draft.source, catalog)).toBe(false);
  });

  it("allows a selected Source with no configuration fields", () => {
    expect(releaseWizardSourceIsReady({ provider: "source/project", config: {} }, catalog)).toBe(
      true,
    );
  });

  it("builds the exact release draft snapshot without injecting build profiles", () => {
    const draft = createReleaseWizardDraft();
    draft.name = "Desktop release";
    draft.source = { provider: "source/project", config: { path: "/game" } };
    draft.destinations = [
      {
        id: "upload",
        provider: "destination/upload",
        enabled: true,
        config: { project: "game" },
        slots: [{ id: "windows", enabled: true, config: {} }],
      },
    ];

    const config = buildReleaseWizardConfig(draft, "project-1", "release-1");

    expect(config).toMatchObject({
      id: "release-1",
      project: "project-1",
      name: "Desktop release",
      source: { provider: "source/project", config: { path: "/game" } },
      destinations: [{ id: "upload", slots: [{ id: "windows" }] }],
      builds: [],
    });
    expect(config.destinations).not.toBe(draft.destinations);
  });

  it("summarizes resolved engine and enabled target labels without hardcoding them", () => {
    expect(releaseWizardBuildSummaries(configWithBuild(), catalog)).toEqual([
      "Build · Electron · Windows x64",
    ]);
  });

  it("creates exactly the planner-validated config shown in Review", () => {
    const resolved = configWithBuild();
    const created = releaseWizardCreationConfig("ready", resolved);

    expect(created).toEqual(resolved);
    expect(created).not.toBe(resolved);
    expect(created?.builds[0].engine).toBe("@pipelab/plugin-electron/producer");
    expect(created?.destinations[0].slots[0].input).toEqual({
      buildId: "desktop",
      targetId: "windows-x64",
    });
    expect(releaseWizardCreationConfig("error", resolved)).toBeUndefined();
  });

  it("marks only enabled, unrouted destination slots for additional build setup", () => {
    const config = configWithBuild();
    config.destinations[0].slots[0].input = undefined;
    expect(releaseWizardNeedsAdditionalBuildSetup(config)).toBe(true);

    config.destinations[0].slots[0].input = { source: true };
    expect(releaseWizardNeedsAdditionalBuildSetup(config)).toBe(false);

    config.destinations[0].enabled = false;
    config.destinations[0].slots[0].input = undefined;
    expect(releaseWizardNeedsAdditionalBuildSetup(config)).toBe(false);
  });

  it("accepts a resolved output only when the planner confirms its route", () => {
    const config = configWithBuild();
    const validPlan = plannerOutput({ producerId: "desktop", outputId: "windows-x64" });

    expect(releaseWizardResolutionIsPlannerValid(config, validPlan)).toBe(true);
    expect(
      releaseWizardResolutionIsPlannerValid(config, {
        ...validPlan,
        issues: [
          {
            code: "release.destination.input.incompatible",
            message: "Incompatible output",
            severity: "error",
            path: "destinations.0.slots.0.input",
          },
        ],
      }),
    ).toBe(false);
    expect(releaseWizardResolutionIsPlannerValid(config, plannerOutput({ source: true }))).toBe(
      false,
    );
    expect(
      releaseWizardResolutionIsPlannerValid(config, {
        ...validPlan,
        issues: [
          {
            code: "release.build.target.unavailable",
            message: "Target unavailable",
            severity: "error",
            path: "builds.0.targets.0",
          },
        ],
      }),
    ).toBe(false);
  });

  it("allows a valid draft when the planner has no automatic route to accept", () => {
    const config = configWithBuild();
    config.builds = [];
    config.destinations[0].slots[0].input = undefined;
    const plan = {
      producers: [],
      outputs: [],
      destinations: [
        { ...config.destinations[0], slots: [{ ...config.destinations[0].slots[0] }] },
      ],
      issues: [
        {
          code: "release.destination.input.required",
          message: "Choose an output for this destination.",
          severity: "error" as const,
          path: "destinations.0.slots.0.input",
        },
      ],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;

    expect(releaseWizardResolutionIsPlannerValid(config, plan)).toBe(true);
    expect(releaseWizardNeedsAdditionalBuildSetup(config)).toBe(true);
  });

  it("invalidates older source-inspection and defaults-resolution requests", () => {
    const sourceRevisions = createWizardRequestRevision();
    const sourceRequest = sourceRevisions.next();
    sourceRevisions.next();

    expect(sourceRevisions.isCurrent(sourceRequest)).toBe(false);

    const defaultsRevisions = createWizardRequestRevision();
    const defaultsRequest = defaultsRevisions.next();
    defaultsRevisions.invalidate();
    expect(defaultsRevisions.isCurrent(defaultsRequest)).toBe(false);
  });
});
