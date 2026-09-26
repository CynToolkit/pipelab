import { describe, expect, it, vi } from "vitest";
import { reactive, toRaw, watch } from "vue";
import {
  buildEnginesFor,
  buildProfileSummary,
  buildTargetsFor,
  buildTargetAvailabilityReason,
  buildTargetIsAvailable,
  buildInputControlVisible,
  applyProducerInspection,
  buildInputSelectionMode,
  connectionMatchesIntegration,
  createBuildProfile,
  createSerializedTaskQueue,
  issuesForPath,
  planOutputOptions,
  outputReferenceChangeImpact,
  outputReferenceConsumers,
  plannerAcceptsBuildInput,
  plannerAcceptsBuildCandidate,
  probeBuildInputCandidates,
  probeCompatibleBuildCandidates,
  deploymentSlotLabel,
  readinessLabel,
  releaseCanRun,
  releaseOutputRefValue,
  runAfterSuccessfulSave,
  selectBuildInput,
  setBuildTargetEnabled,
  switchBuildProfileEngine,
} from "./release-flow-model";
import type {
  ReleaseBuildProfileConfig,
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
    const build = createBuildProfile(catalog, "desktop", "engine-a", "desktop-one", ["windows"])!;
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
    expect(build.targets.map((target) => target.enabled)).toEqual([false, false]);

    expect(setBuildTargetEnabled(build, "macos", true)).toBe(true);
    expect(build.targets.map((target) => target.enabled)).toEqual([false, true]);

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

  it("hides a single input and preserves an explicit chained input during discovery", async () => {
    const buildA = {
      id: "build-a",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const buildB = {
      id: "build-b",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      input: { buildId: "build-a", targetId: "windows" },
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const workflow = reactive<ReleaseConfig>({ ...config, builds: [buildA, buildB] });
    const before = structuredClone(toRaw(workflow));
    const persist = vi.fn();
    const stopWatching = watch(workflow, persist, { deep: true, flush: "sync" });
    const candidates = [
      { value: "source", label: "Source", ref: { source: true as const } },
      {
        value: "build-a:windows",
        label: "Build A — Windows",
        ref: { buildId: "build-a", targetId: "windows" },
      },
      {
        value: "build-b:windows",
        label: "Build B — Windows",
        ref: { buildId: "build-b", targetId: "windows" },
      },
    ];
    const options = await probeBuildInputCandidates(
      workflow,
      "build-b",
      candidates,
      async (draft) =>
        draft.builds[1].input && "buildId" in draft.builds[1].input
          ? ({
              outputs: [],
              producers: [{ id: "build-b" }],
              destinations: [],
              issues: [],
              graph: { nodes: [], edges: [] },
            } as unknown as ReleasePlan)
          : ({
              outputs: [],
              producers: [],
              destinations: [],
              issues: [
                {
                  code: "release.build.input.missing",
                  message: "No compatible input",
                  severity: "error",
                  path: "builds.1.input",
                },
              ],
              graph: { nodes: [], edges: [] },
            } as unknown as ReleasePlan),
    );

    expect(options.map((option) => option.value)).toEqual(["build-a:windows"]);
    expect(buildInputSelectionMode(options)).toBe("hidden");
    expect(buildInputControlVisible(options, [])).toBe(false);
    expect(workflow).toEqual(before);
    expect(workflow.builds[1].input).toEqual({ buildId: "build-a", targetId: "windows" });
    expect(persist).not.toHaveBeenCalled();
    stopWatching();
  });

  it("leaves an implicit single input unset", async () => {
    const workflow: ReleaseConfig = {
      ...config,
      builds: [
        {
          id: "build-b",
          type: "desktop",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "windows", enabled: true, config: {} }],
        },
      ],
    };
    const options = await probeBuildInputCandidates(
      workflow,
      "build-b",
      [{ value: "source", label: "Source", ref: { source: true } }],
      async () =>
        ({
          outputs: [],
          producers: [{ id: "build-b" }],
          destinations: [],
          issues: [],
          graph: { nodes: [], edges: [] },
        }) as unknown as ReleasePlan,
    );

    expect(buildInputSelectionMode(options)).toBe("hidden");
    expect(workflow.builds[0].input).toBeUndefined();
  });

  it("shows ambiguous inputs with no implicit Source selection and persists an explicit choice", () => {
    const build: ReleaseBuildProfileConfig = {
      id: "build-b",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const options = [
      { value: "source", label: "Source", ref: { source: true as const } },
      {
        value: "build-a:windows",
        label: "Build A — Windows",
        ref: { buildId: "build-a", targetId: "windows" },
      },
    ];
    expect(buildInputSelectionMode(options)).toBe("select");
    expect(releaseOutputRefValue(build.input)).toBe("");

    selectBuildInput(build, options, "build-a:windows");
    expect(build.input).toEqual({ buildId: "build-a", targetId: "windows" });
    expect(releaseOutputRefValue(build.input)).toBe("build-a:windows");
  });

  it("does not replace a stale explicit input during candidate discovery", async () => {
    const build = {
      id: "build-b",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      input: { buildId: "deleted-build", targetId: "output" },
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const workflow: ReleaseConfig = { ...config, builds: [build] };
    const before = structuredClone(workflow);
    const issuePlan = {
      outputs: [],
      producers: [],
      destinations: [],
      issues: [
        {
          code: "release.build.input.missing",
          message: "No compatible input",
          severity: "error" as const,
          path: "builds.0.input",
        },
      ],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    const options = await probeBuildInputCandidates(
      workflow,
      "build-b",
      [{ value: "source", label: "Source", ref: { source: true } }],
      async () => issuePlan,
    );

    expect(options).toEqual([]);
    expect(buildInputSelectionMode(options)).toBe("missing");
    expect(buildInputControlVisible(options, issuePlan.issues)).toBe(true);
    expect(workflow).toEqual(before);
    expect(workflow.builds[0].input).toEqual({ buildId: "deleted-build", targetId: "output" });
  });

  it("shows the selector for one valid candidate when the explicit input is stale", async () => {
    const build = {
      id: "build-b",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      input: { buildId: "deleted-build", targetId: "output" },
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const workflow: ReleaseConfig = { ...config, builds: [build] };
    const staleInput = structuredClone(build.input);
    const persistedPlan = {
      outputs: [],
      producers: [],
      destinations: [],
      issues: [
        {
          code: "release.build.input.missing",
          message: "Referenced build is missing",
          severity: "error" as const,
          path: "builds.0.input",
        },
      ],
      graph: { nodes: [], edges: [] },
    } as ReleasePlan;
    const inputIssues = issuesForPath(persistedPlan.issues, "builds.0.input");
    const options = await probeBuildInputCandidates(
      workflow,
      "build-b",
      [{ value: "source", label: "Source", ref: { source: true } }],
      async () =>
        ({
          outputs: [],
          producers: [{ id: "build-b" }],
          destinations: [],
          issues: [],
          graph: { nodes: [], edges: [] },
        }) as unknown as ReleasePlan,
    );

    expect(options).toHaveLength(1);
    expect(buildInputControlVisible(options, inputIssues)).toBe(true);
    expect(buildInputSelectionMode(options, inputIssues)).toBe("select");
    expect(build.input).toEqual(staleInput);

    selectBuildInput(build, options, "source");
    expect(build.input).toEqual({ source: true });
  });

  it("accepts planner-resolved build inputs and rejects missing or invalid inputs", () => {
    const plan = {
      outputs: [],
      producers: [{ id: "build" }],
      destinations: [],
      issues: [],
      graph: { nodes: [], edges: [] },
    } as unknown as ReleasePlan;
    expect(plannerAcceptsBuildInput(plan, "build", 0)).toBe(true);
    expect(
      plannerAcceptsBuildInput(
        {
          ...plan,
          issues: [
            {
              code: "release.build.input.missing",
              message: "No compatible input",
              severity: "error",
              path: "builds.0.input",
            },
          ],
        },
        "build",
        0,
      ),
    ).toBe(false);
    expect(plannerAcceptsBuildInput(plan, "missing-build", 0)).toBe(false);
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
    expect(switched?.targets.every((target) => !target.enabled)).toBe(true);
  });

  it("keeps unavailable targets visible but never enables them by default", () => {
    const catalogWithUnavailableTarget: ReleaseCatalog = {
      ...catalog,
      producers: catalog.producers.map((producer) =>
        producer.id === "engine-a"
          ? {
              ...producer,
              targets: producer.targets.map((target) =>
                target.id === "windows"
                  ? { ...target, availability: { available: false, reason: "SDK is missing" } }
                  : target,
              ),
            }
          : producer,
      ),
    };
    const build = createBuildProfile(
      catalogWithUnavailableTarget,
      "desktop",
      "engine-a",
      "unavailable",
      ["windows"],
    )!;

    expect(build.targets.find((target) => target.id === "windows")?.enabled).toBe(false);
    const windows = buildTargetsFor(catalogWithUnavailableTarget, "engine-a", "desktop").find(
      (target) => target.id === "windows",
    )!;
    expect(buildTargetIsAvailable(windows)).toBe(false);
    expect(buildTargetAvailabilityReason(windows)).toBe("SDK is missing");
    expect(
      buildTargetIsAvailable(
        buildTargetsFor(catalogWithUnavailableTarget, "engine-a", "desktop")[1],
      ),
    ).toBe(true);
    expect(setBuildTargetEnabled(build, "windows", true, windows.availability)).toBe(false);
    expect(build.targets.find((target) => target.id === "windows")?.enabled).toBe(false);
  });

  it("lists source and build output consumers with destination, slot, and downstream build labels", () => {
    const workflow: ReleaseConfig = {
      ...config,
      builds: [
        {
          ...createBuildProfile(catalog, "desktop", "engine-a", "build-a", ["windows"])!,
          name: "Windows package",
        },
        {
          ...createBuildProfile(catalog, "desktop", "engine-a", "build-b", ["windows"])!,
          name: "Installer",
          input: { buildId: "build-a", targetId: "windows" },
        },
      ],
      destinations: [
        {
          id: "destination-a",
          provider: "store",
          enabled: true,
          config: {},
          slots: [
            {
              id: "slot-a",
              name: "Production",
              enabled: true,
              input: { buildId: "build-a", targetId: "windows" },
              config: {},
            },
            {
              id: "slot-source",
              name: "Source upload",
              enabled: true,
              input: { source: true },
              config: {},
            },
          ],
        },
      ],
    };
    const workflowCatalog: ReleaseCatalog = {
      ...catalog,
      buildTypes: [
        { id: "desktop", label: "Desktop" },
        { id: "web", label: "Web" },
      ],
      destinations: [
        {
          id: "store",
          label: "Store",
          accepts: {},
          defaultConfig: {},
        },
      ],
    };

    expect(outputReferenceConsumers(workflow, { buildId: "build-a" }, workflowCatalog)).toEqual([
      {
        kind: "build",
        ownerId: "build-b",
        label: "Installer",
        path: "builds.1.input",
      },
      {
        kind: "destination-slot",
        ownerId: "slot-a",
        label: "Store · Production",
        path: "destinations.0.slots.0.input",
      },
    ]);
    expect(outputReferenceConsumers(workflow, { source: true }, workflowCatalog)).toEqual([
      {
        kind: "destination-slot",
        ownerId: "slot-source",
        label: "Store · Source upload",
        path: "destinations.0.slots.1.input",
      },
    ]);
  });

  it("requires reference-aware confirmation only when a build change affects consumers", () => {
    const consumer = {
      kind: "destination-slot" as const,
      ownerId: "slot-a",
      label: "Store · Production",
      path: "destinations.0.slots.0.input",
    };
    expect(
      outputReferenceChangeImpact({ kind: "build-disable", buildName: "Windows package" }, [])
        .confirmationRequired,
    ).toBe(false);
    expect(
      outputReferenceChangeImpact({ kind: "build-disable", buildName: "Windows package" }, [
        consumer,
      ]),
    ).toEqual({
      confirmationRequired: true,
      message:
        "Disabling “Windows package” will leave the selected output unavailable to Store · Production. Its output reference will stay in place; update it manually if needed.",
    });
    expect(
      outputReferenceChangeImpact({ kind: "build-remove", buildName: "Unused profile" }, []),
    ).toEqual({
      confirmationRequired: true,
      message: "Removing “Unused profile” will delete its build configuration.",
    });
    expect(
      outputReferenceChangeImpact(
        {
          kind: "build-engine",
          buildName: "Windows package",
          newEngine: "Linux Builder",
          discardedSettings: ["signingKey"],
          disabledTargets: ["Windows x64"],
        },
        [],
      ),
    ).toEqual({
      confirmationRequired: true,
      message:
        "Changing “Windows package” to Linux Builder. Settings no longer supported by Linux Builder will be discarded: signingKey. Previously selected targets will be disabled: Windows x64.",
    });
    expect(
      outputReferenceChangeImpact(
        {
          kind: "build-engine",
          buildName: "Windows package",
          newEngine: "Linux Builder",
        },
        [],
      ),
    ).toEqual({ confirmationRequired: false });
    expect(
      outputReferenceChangeImpact(
        {
          kind: "build-engine",
          buildName: "Windows package",
          newEngine: "Linux Builder",
          disabledTargets: ["Windows x64"],
        },
        [consumer],
      ).message,
    ).toContain("Store · Production");
  });

  it("planner-filters compatible build candidates and excludes unavailable targets", async () => {
    const workflow: ReleaseConfig = {
      ...config,
      destinations: [
        {
          id: "destination-a",
          provider: "store",
          enabled: true,
          config: {},
          slots: [{ id: "slot-a", name: "Production", enabled: true, config: {} }],
        },
      ],
    };
    const candidateCatalog: ReleaseCatalog = {
      ...catalog,
      producers: catalog.producers.map((producer) =>
        producer.id === "engine-a"
          ? {
              ...producer,
              targets: producer.targets.map((target) =>
                target.id === "macos"
                  ? { ...target, availability: { available: false, reason: "macOS SDK missing" } }
                  : target,
              ),
            }
          : producer,
      ),
    };
    const choices = await probeCompatibleBuildCandidates(
      workflow,
      candidateCatalog,
      "destination-a",
      "slot-a",
      async (candidate) => {
        const added = candidate.builds.at(-1)!;
        return {
          outputs: [],
          producers:
            added.engine === "engine-a" &&
            added.type === "desktop" &&
            added.targets.some((target) => target.id === "windows" && target.enabled)
              ? [{ id: added.id }]
              : [],
          destinations: [],
          issues: [],
          graph: { nodes: [], edges: [] },
        } as unknown as ReleasePlan;
      },
    );

    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({ type: "desktop", engine: "engine-a", target: "windows" });
  });

  it("discards a compatible-build probe result when its request becomes stale", async () => {
    const workflow: ReleaseConfig = {
      ...config,
      destinations: [
        {
          id: "destination-a",
          provider: "store",
          enabled: true,
          config: {},
          slots: [{ id: "slot-a", name: "Production", enabled: true, config: {} }],
        },
      ],
    };
    let current = true;
    const choices = await probeCompatibleBuildCandidates(
      workflow,
      catalog,
      "destination-a",
      "slot-a",
      async (candidate) => {
        current = false;
        return {
          outputs: [],
          producers: [{ id: candidate.builds.at(-1)!.id }],
          destinations: [],
          issues: [],
          graph: { nodes: [], edges: [] },
        } as unknown as ReleasePlan;
      },
      () => current,
    );

    expect(choices).toEqual([]);
  });

  it("discards a build-input probe result when its request becomes stale", async () => {
    const workflow: ReleaseConfig = {
      ...config,
      builds: [
        {
          id: "build-a",
          type: "desktop",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "windows", enabled: true, config: {} }],
        },
      ],
    };
    let current = true;
    const options = await probeBuildInputCandidates(
      workflow,
      "build-a",
      [{ value: "source", label: "Source", ref: { source: true } }],
      async () => {
        current = false;
        return {
          outputs: [],
          producers: [{ id: "build-a" }],
          destinations: [],
          issues: [],
          graph: { nodes: [], edges: [] },
        } as unknown as ReleasePlan;
      },
      () => current,
    );

    expect(options).toEqual([]);
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

    const inputIssue = {
      code: "release.build.input.missing",
      message: "Choose a compatible input",
      severity: "error" as const,
      path: "builds.0.input",
    };
    const buildIssues = issuesForPath([inputIssue], "builds.0.input");
    expect(buildIssues).toEqual([inputIssue]);
    expect(
      buildInputControlVisible(
        [{ value: "source", label: "Source", ref: { source: true } }],
        buildIssues,
      ),
    ).toBe(true);
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

  it("keeps producer inspection read-only when opening Build settings", () => {
    const build = createBuildProfile(catalog, "desktop", "engine-a", "desktop-one")!;
    const before = structuredClone(build);
    const result = applyProducerInspection(
      build,
      0,
      {
        fieldValues: { preset: "release" },
        fieldOptions: { preset: [{ label: "Release", value: "release" }] },
        issues: [],
      },
      { applyFieldValues: false },
    );

    expect(build).toEqual(before);
    expect(result.options.preset).toEqual([{ label: "Release", value: "release" }]);
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
    expect(releaseCanRun(flow, plan, [], false, false, "error")).toBe(false);
  });

  it("does not run a release when persistence fails", async () => {
    const execute = vi.fn(async () => "executed");

    await expect(
      runAfterSuccessfulSave(async () => {
        throw new Error("save failed");
      }, execute),
    ).rejects.toThrow("save failed");
    expect(execute).not.toHaveBeenCalled();
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
