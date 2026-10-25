import { describe, expect, it, vi } from "vitest";
import { reactive, toRaw, watch } from "vue";
import {
  buildEnginesFor,
  dashboardShipIntentAction,
  buildProfileSummary,
  buildTargetsFor,
  buildTargetAvailabilityReason,
  buildTargetIsAvailable,
  buildInputControlVisible,
  compatibleBuildInputLabel,
  applyProducerInspection,
  blockerAtIndex,
  buildInputSelectionMode,
  connectionMatchesIntegration,
  clampBlockerIndex,
  createBuildProfile,
  appendReleaseDestinationInstance,
  createReleaseSourceConfig,
  createSerializedTaskQueue,
  deduplicateValidationIssues,
  firstBlockingIssue,
  invalidEnvironmentBindingPaths,
  issuesForPath,
  missingRequiredFieldIssues,
  planOutputOptions,
  outputReferenceChangeImpact,
  outputReferenceConsumers,
  plannerAcceptsBuildInput,
  plannerAcceptsBuildCandidate,
  plannedBuildInputLabel,
  probeBuildInputCandidates,
  probeCompatibleBuildCandidates,
  deploymentSlotLabel,
  readinessLabel,
  releaseCanRun,
  shouldInspectReleaseProviderConfig,
  releaseBlockerPresentation,
  releaseReadinessState,
  releaseRepairRoute,
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
  it("adds repeated instances of the same destination provider to one release", () => {
    const flow = structuredClone(config);
    const definition = reactive({
      id: "destination/steam",
      label: "Steam",
      accepts: {},
      defaultConfig: { accountConnectionId: "", options: { channel: "public" } },
    }) satisfies ReleaseCatalog["destinations"][number];
    const ids = ["steam-one", "slot-one", "steam-two", "slot-two"];
    const createId = () => ids.shift()!;

    appendReleaseDestinationInstance(flow, definition, createId);
    appendReleaseDestinationInstance(flow, definition, createId);

    expect(flow.destinations).toHaveLength(2);
    expect(flow.destinations.map((destination) => destination.provider)).toEqual([
      "destination/steam",
      "destination/steam",
    ]);
    expect(flow.destinations.map((destination) => destination.id)).toEqual([
      "steam-one",
      "steam-two",
    ]);
    expect(flow.destinations.map((destination) => destination.name)).toEqual([
      "Destination 1",
      "Destination 2",
    ]);
    expect(flow.destinations.map((destination) => destination.slots[0].id)).toEqual([
      "slot-one",
      "slot-two",
    ]);

    flow.destinations[0].config.accountConnectionId = "first-account";
    expect(flow.destinations[1].config.accountConnectionId).toBe("");
    (flow.destinations[0].config.options as { channel: string }).channel = "beta";
    expect(flow.destinations[1].config.options).toEqual({ channel: "public" });
  });

  it("chooses an unused destination name after deleting a same-provider destination", () => {
    const flow = structuredClone(config);
    const definition = {
      id: "destination/steam",
      label: "Steam",
      accepts: {},
      defaultConfig: {},
    } satisfies ReleaseCatalog["destinations"][number];
    const ids = ["steam-one", "slot-one", "steam-two", "slot-two", "steam-three", "slot-three"];
    const createId = () => ids.shift()!;

    appendReleaseDestinationInstance(flow, definition, createId);
    appendReleaseDestinationInstance(flow, definition, createId);
    const survivingName = flow.destinations[1]!.name;
    flow.destinations = flow.destinations.filter((destination) => destination.id !== "steam-one");
    appendReleaseDestinationInstance(flow, definition, createId);

    expect(flow.destinations.map((destination) => destination.name)).toEqual([
      survivingName,
      "Destination 1",
    ]);
    expect(new Set(flow.destinations.map((destination) => destination.name)).size).toBe(2);
  });

  it("suggests a readable workflow alias for each new same-provider destination", () => {
    const flow = structuredClone(config);
    const definition = {
      id: "destination/steam",
      label: "Steam",
      accepts: {},
      defaultConfig: { account: "" },
      fields: [
        {
          key: "account",
          type: "connection" as const,
          label: "Steam account",
          integration: "steam-account",
        },
      ],
    } satisfies ReleaseCatalog["destinations"][number];
    const destinationCatalog = { ...catalog, destinations: [definition] };
    const ids = ["steam-one", "slot-one", "steam-two", "slot-two"];
    const createId = () => ids.shift()!;

    appendReleaseDestinationInstance(flow, definition, createId, destinationCatalog);
    appendReleaseDestinationInstance(flow, definition, createId, destinationCatalog);

    expect(flow.destinations.map((destination) => destination.config.account)).toEqual([
      "steam-account",
      "steam-account-2",
    ]);
  });

  it("suggests a readable alias when changing to a source with a Connection field", () => {
    const flow = structuredClone(config);
    const source = {
      id: "source/git",
      label: "Git source",
      output: { kind: "project" as const, container: "directory" as const },
      defaultConfig: { account: "", branch: "main" },
      fields: [
        {
          key: "account",
          type: "connection" as const,
          label: "Git account",
          integration: "git",
        },
      ],
    } satisfies ReleaseCatalog["sources"][number];

    expect(createReleaseSourceConfig(flow, source, catalog)).toEqual({
      account: "git-account",
      branch: "main",
    });
  });

  it("suggests a unique alias for a new build Connection requirement", () => {
    const buildCatalog: ReleaseCatalog = {
      ...catalog,
      buildTypes: [{ id: "web", label: "Web" }],
      producers: [
        {
          id: "producer/construct",
          label: "Construct",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: { account: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "Construct account",
              integration: "Construct Account",
              required: true,
            },
          ],
          targets: [{ id: "web", label: "Web", buildType: "web", defaultConfig: {} }],
        },
      ],
    };

    const build = createBuildProfile(
      buildCatalog,
      "web",
      "producer/construct",
      "build-1",
      undefined,
      ["construct-account"],
    )!;

    expect(build.config.account).toBe("construct-account-2");
  });

  it("finds invalid environment bindings across saved workflow property configs", () => {
    const flow = structuredClone(config);
    flow.source.config = { path: "${{ env.BAD{NAME }}" };
    flow.builds = [
      {
        id: "build-one",
        type: "desktop",
        engine: "engine-a",
        enabled: true,
        config: { label: "${{ env.RELEASE-LABEL }}" },
        targets: [],
      },
    ];
    flow.destinations = [
      {
        id: "steam-one",
        provider: "destination/steam",
        enabled: true,
        config: { notes: "${{ env.RELEASE-NOTES }}" },
        slots: [
          {
            id: "windows",
            enabled: true,
            config: { channel: "${{ env.CHANNEL-NAME }}" },
          },
        ],
      },
    ];
    flow.source.config.title = "${{ env.RELEASE_TITLE }}";

    expect(invalidEnvironmentBindingPaths(flow)).toEqual([
      "source.config.path",
      "builds.0.config.label",
      "destinations.0.config.notes",
      "destinations.0.slots.0.config.channel",
    ]);
  });

  it("waits for the matching workflow and settled preflight before handling dashboard Ship", () => {
    const base = {
      intent: true,
      workflowMatchesRoute: true,
      loading: false,
      readiness: "ready" as const,
      canShip: true,
    };
    expect(dashboardShipIntentAction({ ...base, workflowMatchesRoute: false })).toBe("wait");
    expect(dashboardShipIntentAction({ ...base, loading: true })).toBe("wait");
    expect(dashboardShipIntentAction({ ...base, readiness: "checking" })).toBe("wait");
  });

  it("starts only when all existing readiness gates pass and consumes blocked intents", () => {
    const base = {
      intent: true,
      workflowMatchesRoute: true,
      loading: false,
      readiness: "ready" as const,
      canShip: true,
    };
    expect(dashboardShipIntentAction(base)).toBe("ship");
    expect(dashboardShipIntentAction({ ...base, canShip: false })).toBe("blocked");
    expect(dashboardShipIntentAction({ ...base, readiness: "attention" })).toBe("blocked");
    expect(dashboardShipIntentAction({ ...base, readiness: "error" })).toBe("blocked");
    expect(dashboardShipIntentAction({ ...base, intent: false })).toBe("wait");
  });

  it("defers source inspection for environment-bound values without blocking readiness", () => {
    expect(shouldInspectReleaseProviderConfig({ path: "${{ env.PROJECT_PATH }}" })).toBe(false);
    expect(
      shouldInspectReleaseProviderConfig({
        sourceConfig: { path: "/projects/game" },
        config: { flags: ["folder: ${{ env.PROJECT_PATH }}"] },
      }),
    ).toBe(false);
    expect(shouldInspectReleaseProviderConfig({ path: "/projects/game" })).toBe(true);
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: false,
        planning: false,
        hasPlan: true,
        hasReadinessError: false,
        blockingIssueCount: 0,
      }),
    ).toBe("ready");
  });

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
    expect(compatibleBuildInputLabel(options)).toBe("Source");
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

  it("keeps the selector visible when a draft engine rejects the retained input", () => {
    const savedBuild = {
      id: "build-b",
      type: "desktop",
      engine: "engine-a",
      enabled: true,
      input: { buildId: "build-a", targetId: "windows" },
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    } satisfies ReleaseBuildProfileConfig;
    const draftBuild = switchBuildProfileEngine(catalog, savedBuild, "engine-b");
    if (!draftBuild) throw new Error("Expected engine switch to produce a draft build");
    const options = [
      { value: "source", label: "Source — Project", ref: { source: true as const } },
    ];

    expect(draftBuild.engine).toBe("engine-b");
    expect(draftBuild.input).toEqual({ buildId: "build-a", targetId: "windows" });
    expect(buildInputControlVisible(options, [], draftBuild.input)).toBe(true);
    expect(compatibleBuildInputLabel(options, draftBuild.input)).toBeUndefined();

    selectBuildInput(draftBuild, options, "source");
    expect(buildInputControlVisible(options, [], draftBuild.input)).toBe(false);
    expect(compatibleBuildInputLabel(options, draftBuild.input)).toBe("Source — Project");
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

  it("shows the planner-resolved source when a build input is implicit", () => {
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
    const plan = {
      outputs: [],
      producers: [{ id: "build-a", input: { source: true } }],
      destinations: [],
      issues: [],
      graph: { nodes: [], edges: [] },
    } as unknown as ReleasePlan;

    expect(plannedBuildInputLabel(workflow, plan, catalog, "build-a")).toBe("Source — Project");
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

  it("round-trips unrecognized build settings when changing engines", () => {
    const build = {
      ...createBuildProfile(catalog, "desktop", "engine-a", "desktop-one")!,
      config: { preset: "custom", futureProviderSetting: { retained: true } },
    };

    const switched = switchBuildProfileEngine(catalog, build, "engine-b");

    expect(switched?.config).toEqual({
      preset: "custom",
      futureProviderSetting: { retained: true },
    });
  });

  it("suggests a fresh alias when an engine switch changes the Connection integration", () => {
    const connectionCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "engine-old",
          label: "Old engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: { account: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "Old account",
              integration: "old-store",
            },
          ],
          targets: [{ id: "web", label: "Web", buildType: "web", defaultConfig: {} }],
        },
        {
          id: "engine-new",
          label: "New engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: { account: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "New store account",
              integration: "new-store",
            },
          ],
          targets: [{ id: "web", label: "Web", buildType: "web", defaultConfig: {} }],
        },
      ],
    };
    const build = {
      id: "build-1",
      type: "web",
      engine: "engine-old",
      enabled: true,
      config: { account: "old-store-production" },
      targets: [{ id: "web", enabled: false, config: {} }],
    } satisfies ReleaseBuildProfileConfig;

    const switched = switchBuildProfileEngine(connectionCatalog, build, "engine-new", [
      "old-store-production",
    ]);

    expect(switched?.config.account).toBe("new-store-account");
  });

  it("does not carry ordinary or unknown producer values into new Connection aliases", () => {
    const producerCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "engine-old",
          label: "Old engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: { account: "", extra: "" },
          fields: [{ key: "account", type: "text", label: "Version" }],
          targets: [],
        },
        {
          id: "engine-new",
          label: "New engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: { account: "", extra: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "New store account",
              integration: "new-store",
            },
            {
              key: "extra",
              type: "connection",
              label: "New API account",
              integration: "new-api",
            },
          ],
          targets: [],
        },
      ],
    };
    const build = {
      id: "build-1",
      type: "web",
      engine: "engine-old",
      enabled: true,
      config: { account: "1.0.0", extra: "unrecognized-old-setting" },
      targets: [],
    } satisfies ReleaseBuildProfileConfig;

    const switched = switchBuildProfileEngine(producerCatalog, build, "engine-new");

    expect(switched?.config).toEqual({
      account: "new-store-account",
      extra: "new-api-account",
    });
  });

  it("replaces a target alias when an engine switch reuses its ID for another Connection integration", () => {
    const targetCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "engine-old",
          label: "Old engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: {},
          fields: [],
          targets: [
            {
              id: "web",
              label: "Web",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "Old web account",
                  integration: "old-store",
                },
              ],
            },
            {
              id: "preview",
              label: "Preview",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "Shared preview account",
                  integration: "shared-store",
                },
              ],
            },
            {
              id: "release",
              label: "Release",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [{ key: "account", type: "text", label: "Version" }],
            },
            {
              id: "missing-field",
              label: "Unrecognized old target",
              buildType: "web",
              defaultConfig: {},
              fields: [],
            },
          ],
        },
        {
          id: "engine-new",
          label: "New engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: {},
          fields: [],
          targets: [
            {
              id: "web",
              label: "Web",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "New web account",
                  integration: "new-store",
                },
              ],
            },
            {
              id: "preview",
              label: "Preview",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "Shared preview account",
                  integration: "shared-store",
                },
              ],
            },
            {
              id: "release",
              label: "Release",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "New release account",
                  integration: "release-store",
                },
              ],
            },
            {
              id: "missing-field",
              label: "New target field",
              buildType: "web",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "New target account",
                  integration: "new-target-store",
                },
              ],
            },
          ],
        },
      ],
    };
    const build = {
      id: "build-1",
      type: "web",
      engine: "engine-old",
      enabled: true,
      config: {},
      targets: [
        { id: "web", enabled: true, config: { account: "old-web-account" } },
        { id: "preview", enabled: true, config: { account: "shared-store-production" } },
        { id: "release", enabled: true, config: { account: "1.0.0" } },
        { id: "missing-field", enabled: true, config: { account: "old-unrecognized-value" } },
      ],
    } satisfies ReleaseBuildProfileConfig;

    const switched = switchBuildProfileEngine(targetCatalog, build, "engine-new", [
      "old-web-account",
      "shared-store-production",
    ]);

    expect(switched?.targets).toEqual([
      { id: "web", enabled: false, config: { account: "new-web-account" } },
      { id: "preview", enabled: false, config: { account: "shared-store-production" } },
      { id: "release", enabled: false, config: { account: "new-release-account" } },
      { id: "missing-field", enabled: false, config: { account: "new-target-account" } },
    ]);
  });

  it("suggests an alias when enabling an existing target with an empty Connection", () => {
    const targetCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          ...catalog.producers[0],
          fields: [],
          targets: [
            {
              id: "windows",
              label: "Windows x64",
              buildType: "desktop",
              defaultConfig: { account: "" },
              fields: [
                {
                  key: "account",
                  type: "connection",
                  label: "Windows signing account",
                  integration: "signing-store",
                },
              ],
            },
          ],
        },
      ],
    };
    const build = {
      ...createBuildProfile(targetCatalog, "desktop", "engine-a", "build-1")!,
      targets: [{ id: "windows", enabled: false, config: { account: "" } }],
    };

    expect(
      setBuildTargetEnabled(
        build,
        "windows",
        true,
        undefined,
        undefined,
        targetCatalog.producers[0].targets[0].fields,
        ["other-account"],
      ),
    ).toBe(true);
    expect(build.targets[0].config.account).toBe("windows-signing-account");
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

  it("treats static target availability as unknown until the agent inspects the host", () => {
    const target = {
      ...catalog.producers[0].targets[0],
      availabilityStatus: "unknown" as const,
    };

    expect(buildTargetIsAvailable(target)).toBe(false);
    expect(buildTargetAvailabilityReason(target)).toBe("Requires agent to check availability.");
    expect(
      setBuildTargetEnabled(
        { ...createBuildProfile(catalog, "desktop", "engine-a", "unknown-target")! },
        target.id,
        true,
        undefined,
        target.availabilityStatus,
      ),
    ).toBe(false);
    expect(
      createBuildProfile(
        { ...catalog, producers: [{ ...catalog.producers[0], targets: [target] }] },
        "desktop",
        "engine-a",
        "unknown-target",
        [target.id],
      )?.targets[0].enabled,
    ).toBe(false);
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
    expect(releaseCanRun(flow, plan, [], false, false, "saved", true)).toBe(false);
    expect(releaseCanRun(flow, plan, [], false, false, "saved", false, true)).toBe(false);
    expect(releaseCanRun(flow, plan, [], false, false, "saved", false, false, true)).toBe(false);
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

  it("deduplicates summary issues without collapsing different actionable paths", () => {
    const duplicate = {
      code: "release.build.input.invalid",
      message: "Choose a compatible input.",
      severity: "error" as const,
      path: "builds.0.input",
    };
    const sameMessageAtDifferentPath = { ...duplicate, path: "builds.1.input" };

    expect(
      deduplicateValidationIssues([duplicate, { ...duplicate }, sameMessageAtDifferentPath]),
    ).toEqual([duplicate, sameMessageAtDifferentPath]);
  });

  it("keeps readiness attention visible while checks continue and never reports ready early", () => {
    const warning = { code: "notice", message: "Optional", severity: "warning" as const };
    const blocker = {
      code: "release.connection.missing",
      message: "Choose a connection.",
      severity: "error" as const,
      path: "source.config.account",
    };
    expect(firstBlockingIssue([warning, blocker])).toBe(blocker);
    expect(firstBlockingIssue([warning])).toBeUndefined();
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: true,
        planning: true,
        hasPlan: false,
        hasReadinessError: false,
        blockingIssueCount: 1,
      }),
    ).toBe("attention");
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: true,
        planning: false,
        hasPlan: true,
        hasReadinessError: false,
        blockingIssueCount: 0,
      }),
    ).toBe("checking");
    expect(
      releaseReadinessState({
        loading: true,
        inspectingSource: false,
        planning: false,
        hasPlan: true,
        hasReadinessError: false,
        blockingIssueCount: 0,
      }),
    ).toBe("checking");
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: false,
        planning: false,
        hasPlan: true,
        hasReadinessError: false,
        blockingIssueCount: 0,
        invalidFieldCount: 1,
      }),
    ).toBe("attention");
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: false,
        planning: false,
        hasPlan: true,
        hasReadinessError: false,
        blockingIssueCount: 0,
      }),
    ).toBe("ready");
    expect(
      releaseReadinessState({
        loading: false,
        inspectingSource: false,
        planning: false,
        hasPlan: false,
        hasReadinessError: true,
        blockingIssueCount: 0,
      }),
    ).toBe("error");
  });

  it("surfaces known required-field blockers from catalog metadata before planning finishes", () => {
    const workflow: ReleaseConfig = {
      ...config,
      source: { provider: "source", config: { count: 0 } },
    };
    const metadata: ReleaseCatalog = {
      ...catalog,
      sources: [
        {
          ...catalog.sources[0],
          fields: [
            { key: "path", type: "file", label: "Project path", required: true },
            { key: "count", type: "number", label: "Item count", required: true },
          ],
        },
      ],
      producers: catalog.producers.map((producer) =>
        producer.id === "engine-a"
          ? {
              ...producer,
              fields: [{ key: "preset", type: "select" as const, label: "Preset", required: true }],
              targets: producer.targets.map((target) =>
                target.id === "windows"
                  ? {
                      ...target,
                      fields: [
                        { key: "signing", type: "text" as const, label: "Signing", required: true },
                      ],
                    }
                  : target,
              ),
            }
          : producer,
      ),
      destinations: [
        {
          id: "destination",
          label: "Destination",
          accepts: {},
          defaultConfig: {},
          fields: [{ key: "channel", type: "text", label: "Channel", required: true }],
          slotFields: [{ key: "token", type: "password", label: "Token", required: true }],
        },
      ],
    };

    expect(missingRequiredFieldIssues(workflow, metadata)).toEqual([
      {
        code: "release.field.required",
        message: "Project path is required.",
        severity: "error",
        path: "source.config.path",
      },
    ]);
    workflow.source.config.path = "/project.pok";
    workflow.source.config.count = 0;
    workflow.destinations = [
      {
        id: "destination-one",
        provider: "destination",
        enabled: false,
        config: {},
        slots: [{ id: "slot-one", enabled: false, config: {} }],
      },
    ];
    workflow.builds = [
      {
        id: "build-one",
        type: "desktop",
        engine: "engine-a",
        enabled: false,
        config: {},
        targets: [{ id: "windows", enabled: false, config: {} }],
      },
    ];
    expect(missingRequiredFieldIssues(workflow, metadata)).toEqual([]);

    workflow.destinations[0].enabled = true;
    workflow.destinations[0].slots[0].enabled = true;
    workflow.builds[0].enabled = true;
    expect(missingRequiredFieldIssues(workflow, metadata).map((issue) => issue.path)).toEqual([
      "builds.0.config.preset",
      "destinations.0.config.channel",
      "destinations.0.slots.0.config.token",
    ]);
    workflow.builds[0].targets[0].enabled = true;
    expect(missingRequiredFieldIssues(workflow, metadata).map((issue) => issue.path)).toContain(
      "builds.0.targets.0.config.signing",
    );
  });

  it("clamps blocker navigation when the current issue list changes", () => {
    const original = [
      { code: "first", message: "First issue", severity: "error" as const },
      { code: "second", message: "Second issue", severity: "error" as const },
    ];
    expect(blockerAtIndex(original, 0)?.code).toBe("first");
    expect(blockerAtIndex(original, 1)?.code).toBe("second");
    expect(clampBlockerIndex(-1, original.length)).toBe(0);
    expect(clampBlockerIndex(2, original.length)).toBe(1);
    expect(clampBlockerIndex(1, 0)).toBe(0);

    const current = [original[0]!];
    const clampedSelection = blockerAtIndex(current, clampBlockerIndex(1, current.length));
    expect(clampedSelection?.code).toBe("first");
    expect(releaseBlockerPresentation(clampedSelection!).actionLabel).toBe("Review issues");
  });

  it("uses the known integration for a contextual connection repair CTA", () => {
    const issue = {
      code: "steam.account.required",
      message: "A Steam account connection is required.",
      severity: "error" as const,
      path: "destinations.0.config.accountConnectionId",
    };
    expect(
      releaseBlockerPresentation(issue, {
        targetLabel: "Steam",
        connectionLabel: "Steam",
        connectionFieldLabel: "account",
        hasMatchingConnection: false,
      }),
    ).toEqual({
      title: "Connect your Steam account",
      description: "A Steam account connection is required.",
      actionLabel: "Add Steam connection",
    });
    expect(
      releaseBlockerPresentation(issue, {
        targetLabel: "Steam",
        connectionLabel: "Steam",
        connectionFieldLabel: "account",
        hasMatchingConnection: true,
      }).actionLabel,
    ).toBe("Select Steam connection");
    expect(releaseRepairRoute(issue)).toBe("configuration");
  });

  it("identifies the destination in a same-provider blocker repair action", () => {
    const issue = {
      code: "itch.project.required",
      message: "An Itch project is required.",
      severity: "error" as const,
      path: "destinations.1.config.project",
    };

    expect(
      releaseBlockerPresentation(issue, {
        targetLabel: "Itch.io",
        destinationLabel: "Itch.io — Personal preview",
      }),
    ).toEqual({
      title: "Configure Itch.io — Personal preview",
      description: "An Itch project is required.",
      actionLabel: "Configure Itch.io — Personal preview",
    });
  });

  it("routes the first blocker to its existing repair surface", () => {
    expect(
      releaseRepairRoute({
        code: "release.connection.integration",
        message: "Wrong connection.",
        severity: "error",
        path: "builds.0.config.account",
      }),
    ).toBe("builds");
    expect(
      releaseRepairRoute({
        code: "release.connection.missing",
        message: "Choose a connection.",
        severity: "error",
        path: "source.config.account",
      }),
    ).toBe("configuration");
    expect(
      releaseRepairRoute({
        code: "release.connection.missing",
        message: "Choose a connection.",
        severity: "error",
      }),
    ).toBe("connections");
    expect(
      releaseRepairRoute({
        code: "release.build.invalid",
        message: "Choose a target.",
        severity: "error",
        path: "builds.0.targets",
      }),
    ).toBe("builds");
    expect(
      releaseRepairRoute({
        code: "release.destination.invalid",
        message: "Select an output.",
        severity: "error",
        path: "destinations.0.slots.0.input",
      }),
    ).toBe("builds");
    expect(
      releaseRepairRoute({
        code: "release.source.invalid",
        message: "Select a source.",
        severity: "error",
        path: "source.config.path",
      }),
    ).toBe("configuration");
    expect(
      releaseRepairRoute({
        code: "release.invalid",
        message: "Resolve this issue.",
        severity: "error",
      }),
    ).toBe("issues");
  });
});
