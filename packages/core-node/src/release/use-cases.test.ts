import { describe, expect, it } from "vitest";
import {
  compileReleasePlan,
  createReleaseConfig,
  planRelease,
  RELEASE_DEFAULTS,
  resolveReleaseDefaults,
  type ArtifactDescriptor,
  type ReleaseBuildProfileConfig,
  type ReleaseBuildTargetConfig,
  type ReleaseConfig,
  type ReleaseCompileContext,
  type ReleaseDefaultEntry,
  type ReleaseDestinationConfig,
  type ReleaseDestinationDefinition,
  type ReleaseDestinationSlot,
  type ReleaseHostContext,
  type ReleaseOutputRef,
  type ReleasePlan,
  type ReleasePlanningContext,
  type ReleaseProducerDefinition,
  type ReleaseRegistry,
} from "@pipelab/shared";
import { buildCoreReleaseRegistry } from "./registry";

/**
 * Use-case tests for the release model: destination slots are not OS-bound, a build profile exposes
 * its enabled targets but only consumed targets are compiled, and defaults only fill empty slots.
 * Real providers are used everywhere except the scenarios marked FAKE.
 */

// Engine, destination and source ids of the real providers used below.
const CONSTRUCT_PRODUCER = "@pipelab/plugin-construct/producer";
const CONSTRUCT_SOURCE = "@pipelab/plugin-construct/source";
const ELECTRON_PRODUCER = "@pipelab/plugin-electron/producer";
const TAURI_PRODUCER = "@pipelab/plugin-tauri/producer";
const GODOT_PRODUCER = "@pipelab/plugin-godot/producer";
const GODOT_SOURCE = "@pipelab/plugin-godot/source";
const STEAM = "@pipelab/plugin-steam/destination";
const ITCH = "@pipelab/plugin-itch/destination";
const POKI = "@pipelab/plugin-poki/destination";
const FOLDER = "@pipelab/core/destination/folder";
const ZIP = "@pipelab/core/destination/zip";
const BUNDLE = "@pipelab/core/bundle";

// Step `uses` values that the scenarios count or look up.
const CONSTRUCT_EXPORT_STEP = "@pipelab/plugin-construct/export-construct-project";
const ELECTRON_STEP = "@pipelab/plugin-electron/electron:package:v2";
const TAURI_STEP = "@pipelab/plugin-tauri/tauri:package:v2";

// FAKE providers: same shapes as the real ones, registered next to the real registry.
const FAKE_CAPACITOR = "@pipelab/fake-capacitor/producer";
const FAKE_PLAY_STORE = "@pipelab/fake-play-store/destination";
const FAKE_PAGES = "@pipelab/fake-cloudflare-pages/destination";

const realRegistry = buildCoreReleaseRegistry();

const linux: ReleaseHostContext = { platform: "linux", architecture: "x64" };
const planning = (host: ReleaseHostContext): ReleasePlanningContext => ({ host });

const SOURCE: ReleaseOutputRef = { source: true };
const out = (buildId: string, targetId: string): ReleaseOutputRef => ({ buildId, targetId });

const constructSource: ReleaseConfig["source"] = {
  provider: CONSTRUCT_SOURCE,
  config: {
    path: "/games/space/space.c3p",
    profilePath: "/profiles/construct",
    accountConnectionId: "",
    version: "",
  },
};

const godotSource: ReleaseConfig["source"] = {
  provider: GODOT_SOURCE,
  config: { path: "/games/godot-game" },
};

type Destination = ReleaseDestinationConfig;

/** A release config with the given source, destinations and builds. */
const scenario = (
  source: ReleaseConfig["source"],
  destinations: Destination[] = [],
  builds: ReleaseBuildProfileConfig[] = [],
): ReleaseConfig => ({
  ...createReleaseConfig({
    id: "weekly-release",
    project: "space-game",
    name: "Space game weekly release",
    source,
  }),
  builds,
  destinations,
});

const slot = (
  id: string,
  config: Record<string, unknown> = {},
  input?: ReleaseOutputRef,
): ReleaseDestinationSlot => ({ id, enabled: true, config, ...(input ? { input } : {}) });

const destination = (
  id: string,
  provider: string,
  config: Record<string, unknown>,
  slots: ReleaseDestinationSlot[],
): Destination => ({ id, provider, enabled: true, config, slots });

const steamDestination = (id: string, appId: string, ...slots: ReleaseDestinationSlot[]) =>
  destination(id, STEAM, { accountConnectionId: "steam-account", appId, description: "" }, slots);

const itchDestination = (...slots: ReleaseDestinationSlot[]) =>
  destination("itch", ITCH, { accountConnectionId: "itch-account", project: "space-game" }, slots);

const pokiDestination = (...slots: ReleaseDestinationSlot[]) =>
  destination("poki", POKI, { project: "space-game", name: "1.0.0", notes: "Weekly build" }, slots);

const folderDestination = (...slots: ReleaseDestinationSlot[]) =>
  destination(
    "folder",
    FOLDER,
    {},
    slots.map((item) => ({ ...item, config: { outputDir: "/output/space", ...item.config } })),
  );

const zipDestination = (input?: ReleaseOutputRef) =>
  destination("zip", ZIP, {}, [slot("bundle", { outputPath: "/output/space-release.zip" }, input)]);

/** Target configs for a build: every id in `ids`, enabled only when listed in `enabledIds`. */
const targetsOf = (
  ids: string[],
  enabledIds: string[] = ids,
  configs: Record<string, Record<string, unknown>> = {},
): ReleaseBuildTargetConfig[] =>
  ids.map((id) => ({ id, enabled: enabledIds.includes(id), config: configs[id] ?? {} }));

const constructWebBuild = (id = "construct-web"): ReleaseBuildProfileConfig => ({
  id,
  type: "web",
  engine: CONSTRUCT_PRODUCER,
  enabled: true,
  input: SOURCE,
  config: {},
  targets: targetsOf(["web"]),
});

const electronBuild = (
  id: string,
  input: ReleaseOutputRef,
  targetIds: string[],
  enabledIds: string[] = targetIds,
  config: Record<string, unknown> = {},
): ReleaseBuildProfileConfig => ({
  id,
  type: "desktop",
  engine: ELECTRON_PRODUCER,
  enabled: true,
  input,
  config,
  targets: targetsOf(targetIds, enabledIds),
});

const tauriBuild = (
  id: string,
  input: ReleaseOutputRef,
  targetIds: string[],
): ReleaseBuildProfileConfig => ({
  id,
  type: "desktop",
  engine: TAURI_PRODUCER,
  enabled: true,
  input,
  config: {},
  targets: targetsOf(targetIds),
});

const bundleBuild = (inputs: ReleaseOutputRef[]): ReleaseBuildProfileConfig => ({
  id: "bundle",
  type: "bundle",
  engine: BUNDLE,
  enabled: true,
  inputs,
  config: {},
  targets: targetsOf(["zip"]),
});

const errorsOf = (plan: ReleasePlan) => plan.issues.filter((issue) => issue.severity === "error");

/** Engine ids shortened to their provider name, e.g. `@pipelab/plugin-construct/producer` -> `construct`. */
const engineName = (engine: string) =>
  engine.replace(/^@pipelab\/(plugin-)?/, "").replace(/\/producer$/, "");

/** Stable names for build ids: `b0`, `b1`, ... by position in the config. */
const buildNames = (config: ReleaseConfig) =>
  new Map(config.builds.map((build, index) => [build.id, `b${index}`]));

const refName = (ref: ReleaseOutputRef, names: Map<string, string>) =>
  "source" in ref ? "source" : `${names.get(ref.buildId) ?? "unknown"}.${ref.targetId}`;

/** Compact, id-free view of the builds: engine, enabled targets and the output each build reads. */
const summarizeBuilds = (config: ReleaseConfig) => {
  const names = buildNames(config);
  return config.builds.map((build) => ({
    engine: engineName(build.engine),
    enabledTargets: build.targets.filter((target) => target.enabled).map((target) => target.id),
    // An input-less build is fed by the source through the planner's automatic resolution.
    input: build.input ? refName(build.input, names) : "implicit",
  }));
};

/** Compact, id-free view of what each destination slot reads. */
const summarizeSlots = (config: ReleaseConfig) => {
  const names = buildNames(config);
  return config.destinations.flatMap((item) =>
    item.slots.map((current) => ({
      destination: item.id,
      slot: current.id,
      input: current.input ? refName(current.input, names) : "empty",
    })),
  );
};

/** Replaces generated build ids in text with their stable `bN` names. */
const normalizeIds = (text: string, config: ReleaseConfig) =>
  [...buildNames(config)].reduce((value, [id, name]) => value.split(id).join(name), text);

type CompiledSteps = ReturnType<typeof compileReleasePlan>["steps"];

/** Compiled steps as `{id, uses, needs}` with generated build ids replaced by stable names. */
const summarizeSteps = (config: ReleaseConfig, steps: CompiledSteps) =>
  steps.map((step) => ({
    id: normalizeIds(step.id, config),
    uses: step.uses,
    needs: (step.needs ?? []).map((need) => normalizeIds(need, config)),
  }));

/** Resolves defaults and plans. The caller decides what a clean plan means for its scenario. */
const resolveAndPlan = (
  config: ReleaseConfig,
  host: ReleaseHostContext = linux,
  registry: ReleaseRegistry = realRegistry,
  defaults?: ReleaseDefaultEntry[],
) => {
  const context = planning(host);
  const resolved = resolveReleaseDefaults(config, registry, context, defaults);
  const plan = planRelease(resolved, registry, context);
  return { resolved, plan };
};

/**
 * Resolves defaults, asserts a plan with zero error issues, compiles it and asserts that a second
 * resolve over its own output changes nothing.
 */
const resolveAndCompile = (
  config: ReleaseConfig,
  host: ReleaseHostContext = linux,
  registry: ReleaseRegistry = realRegistry,
  defaults?: ReleaseDefaultEntry[],
) => {
  const context = planning(host);
  const { resolved, plan } = resolveAndPlan(config, host, registry, defaults);
  expect(errorsOf(plan)).toEqual([]);
  const compileContext: ReleaseCompileContext = { host };
  const workflow = compileReleasePlan(resolved, plan, registry, compileContext);
  expect(resolveReleaseDefaults(resolved, registry, context, defaults)).toEqual(resolved);
  return {
    resolved,
    plan,
    workflow,
    steps: summarizeSteps(resolved, workflow.steps),
  };
};

/** Defaults table with the desktop entry pointed at the host's own OS target. */
const HOST_DEFAULTS: ReleaseDefaultEntry[] = RELEASE_DEFAULTS.map((entry) =>
  entry.buildType === "desktop" ? { ...entry, target: "host" } : entry,
);

describe("Construct to Poki: the Construct web build alone, no desktop build", () => {
  // Story: a web-only game is published to Poki and nothing else is built.
  it("adds only the Construct web build and Poki reads it", () => {
    const { resolved, plan, steps } = resolveAndCompile(
      scenario(constructSource, [pokiDestination(slot("web"))]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
    expect(plan.producers.map((producer) => producer.provider)).toEqual([CONSTRUCT_PRODUCER]);
    expect(steps).toEqual([
      { id: "release-construct-source", uses: "@pipelab/core/passthrough", needs: [] },
      { id: "b0-web-export", uses: CONSTRUCT_EXPORT_STEP, needs: [] },
      { id: "b0-web-extract", uses: "@pipelab/core/archive/unzip", needs: ["b0-web-export"] },
      { id: "poki-poki-web", uses: "@pipelab/plugin-poki/poki-upload", needs: ["b0-web-extract"] },
    ]);
  });
});

describe("Construct to a Folder: the default desktop target follows the host OS", () => {
  // Story: a developer copies a playable desktop build to a local folder on whatever machine runs the release.
  it.each([
    ["linux", "x64", "linux-x64"],
    ["win32", "x64", "windows-x64"],
    ["darwin", "arm64", "macos-arm64"],
  ])(
    "on %s-%s the Electron build enables the host target %s",
    (platform, architecture, targetId) => {
      const { resolved, steps } = resolveAndCompile(
        scenario(constructSource, [folderDestination(slot("output"))]),
        { platform, architecture },
        realRegistry,
        HOST_DEFAULTS,
      );
      expect(summarizeBuilds(resolved)).toEqual([
        { engine: "construct", enabledTargets: ["web"], input: "source" },
        { engine: "electron", enabledTargets: [targetId], input: "b0.web" },
      ]);
      expect(summarizeSlots(resolved)).toEqual([
        { destination: "folder", slot: "output", input: `b1.${targetId}` },
      ]);
      expect(steps.map((step) => step.id)).toEqual([
        "release-construct-source",
        "b0-web-export",
        "b0-web-extract",
        `b1-${targetId}`,
        "release-folder-folder-output",
      ]);
    },
  );

  // Story: on a host with no matching engine target, the release asks the user to choose an output.
  it("adds nothing and keeps the Steam slot waiting when the engine has no target for the host", () => {
    const config = scenario(constructSource, [
      steamDestination("steam", "480100", slot("windows", { depotId: "480101" })),
    ]);
    const { resolved, plan } = resolveAndPlan(
      config,
      { platform: "freebsd", architecture: "x64" },
      realRegistry,
      HOST_DEFAULTS,
    );
    expect(resolved.builds).toEqual([]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "empty" },
    ]);
    expect(errorsOf(plan).map((issue) => issue.code)).toEqual([
      "release.destination.input.required",
    ]);
    expect(
      resolveReleaseDefaults(
        resolved,
        realRegistry,
        planning({ platform: "freebsd", architecture: "x64" }),
        HOST_DEFAULTS,
      ),
    ).toEqual(resolved);
  });
});

describe("Folder destinations read a build output, never the raw source", () => {
  // Story: a copy to a folder always ships a built artifact, so the release never copies the raw project.
  const webFolderSource: ReleaseConfig["source"] = {
    provider: "@pipelab/core/source/web-folder",
    config: { path: "/games/space-web" },
  };

  it("refuses a Folder slot the user pointed at the Construct source and leaves the choice to the user", () => {
    const { resolved, plan } = resolveAndPlan(
      scenario(constructSource, [folderDestination(slot("output", {}, SOURCE))]),
      linux,
      realRegistry,
      HOST_DEFAULTS,
    );
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "folder", slot: "output", input: "source" },
    ]);
    expect(errorsOf(plan).map((issue) => issue.code)).toEqual([
      "release.destination.input.build-required",
    ]);
  });

  it("fills an empty Folder slot on a web folder source with the default desktop chain", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(webFolderSource, [folderDestination(slot("output"))]),
      linux,
      realRegistry,
      HOST_DEFAULTS,
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "electron", enabledTargets: ["linux-x64"], input: "source" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "folder", slot: "output", input: "b0.linux-x64" },
    ]);
    expect(steps.map((step) => step.id)).toEqual([
      "release-web-folder-source",
      "b0-linux-x64",
      "release-folder-folder-output",
    ]);
  });
});

describe("Godot to itch.io: one slot gets Godot's native desktop export, not Electron", () => {
  // Story: a Godot game is shipped to itch.io as a native desktop build of the machine doing the release.
  type HostTargetEntry = ReleaseDefaultEntry & {
    targetConfigs?: Record<string, Record<string, unknown>>;
  };
  const GODOT_DESKTOP_ENTRY: HostTargetEntry = {
    buildType: "desktop",
    source: "godot",
    engine: GODOT_PRODUCER,
    target: "host",
    targetConfigs: {
      "linux-x64": { preset: "Linux" },
      "windows-x64": { preset: "Windows Desktop" },
      "macos-arm64": { preset: "macOS" },
    },
  };
  const GODOT_DEFAULTS: ReleaseDefaultEntry[] = [GODOT_DESKTOP_ENTRY, ...RELEASE_DEFAULTS];

  it.each([
    ["linux", "x64", "linux-x64", "Linux"],
    ["win32", "x64", "windows-x64", "Windows Desktop"],
  ])(
    "on %s-%s builds one Godot desktop export for %s with preset %s",
    (platform, architecture, targetId, preset) => {
      const { resolved, steps } = resolveAndCompile(
        scenario(godotSource, [itchDestination(slot("main", { channel: "main" }))]),
        { platform, architecture },
        realRegistry,
        GODOT_DEFAULTS,
      );
      expect(summarizeBuilds(resolved)).toEqual([
        { engine: "godot", enabledTargets: [targetId], input: "source" },
      ]);
      expect(summarizeSlots(resolved)).toEqual([
        { destination: "itch", slot: "main", input: `b0.${targetId}` },
      ]);
      expect(
        resolved.builds.map((build) =>
          build.targets
            .filter((target) => target.enabled)
            .map((target) => ({ id: target.id, preset: target.config.preset })),
        ),
      ).toEqual([[{ id: targetId, preset }]]);
      expect(steps.map((step) => step.id)).toEqual([
        "release-godot-source",
        `b0-${targetId}`,
        "itch-itch-main",
      ]);
    },
  );
});

describe("Construct to Steam with two depot slots: one Electron build exposes three OS targets and compiles two", () => {
  // Story: one Electron profile is set up for Windows, Linux and macOS, but only Windows and Linux depots are uploaded.
  const config = () =>
    scenario(
      constructSource,
      [
        steamDestination(
          "steam",
          "480100",
          slot("windows", { depotId: "480101" }, out("desktop-electron", "windows-x64")),
          slot("linux", { depotId: "480102" }, out("desktop-electron", "linux-x64")),
        ),
      ],
      [
        constructWebBuild(),
        electronBuild("desktop-electron", out("construct-web", "web"), [
          "windows-x64",
          "linux-x64",
          "macos-arm64",
        ]),
      ],
    );

  it("exposes all three enabled targets and compiles only the consumed Windows and Linux ones", () => {
    const { resolved, steps } = resolveAndCompile(config());
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      {
        engine: "electron",
        enabledTargets: ["windows-x64", "linux-x64", "macos-arm64"],
        input: "b0.web",
      },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.windows-x64" },
      { destination: "steam", slot: "linux", input: "b1.linux-x64" },
    ]);
    expect(steps).toEqual([
      { id: "release-construct-source", uses: "@pipelab/core/passthrough", needs: [] },
      { id: "b0-web-export", uses: CONSTRUCT_EXPORT_STEP, needs: [] },
      { id: "b0-web-extract", uses: "@pipelab/core/archive/unzip", needs: ["b0-web-export"] },
      { id: "b1-windows-x64", uses: ELECTRON_STEP, needs: ["b0-web-extract"] },
      { id: "b1-linux-x64", uses: ELECTRON_STEP, needs: ["b0-web-extract"] },
      {
        id: "steam-steam-windows",
        uses: "@pipelab/plugin-steam/steam-upload",
        needs: ["b1-windows-x64"],
      },
      {
        id: "steam-steam-linux",
        uses: "@pipelab/plugin-steam/steam-upload",
        needs: ["b1-linux-x64"],
      },
    ]);
  });
});

describe("Electron on Windows and Tauri on Linux side by side, each feeding its own slot", () => {
  // Story: the same web export becomes a Windows Electron app for Steam and a Linux Tauri app for itch.io.
  it("leaves both explicit builds untouched and compiles one web export shared by both", () => {
    const configured = scenario(
      constructSource,
      [
        steamDestination(
          "steam",
          "480100",
          slot("windows", { depotId: "480101" }, out("desktop-electron", "windows-x64")),
        ),
        itchDestination(slot("linux", { channel: "linux" }, out("desktop-tauri", "linux-x64"))),
      ],
      [
        constructWebBuild(),
        electronBuild("desktop-electron", out("construct-web", "web"), ["windows-x64"]),
        tauriBuild("desktop-tauri", out("construct-web", "web"), ["linux-x64"]),
      ],
    );
    const { resolved, steps } = resolveAndCompile(configured);
    expect(resolved).toEqual(configured);
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["windows-x64"], input: "b0.web" },
      { engine: "tauri", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.windows-x64" },
      { destination: "itch", slot: "linux", input: "b2.linux-x64" },
    ]);
    expect(steps).toEqual([
      { id: "release-construct-source", uses: "@pipelab/core/passthrough", needs: [] },
      { id: "b0-web-export", uses: CONSTRUCT_EXPORT_STEP, needs: [] },
      { id: "b0-web-extract", uses: "@pipelab/core/archive/unzip", needs: ["b0-web-export"] },
      { id: "b1-windows-x64", uses: ELECTRON_STEP, needs: ["b0-web-extract"] },
      { id: "b2-linux-x64", uses: TAURI_STEP, needs: ["b0-web-extract"] },
      {
        id: "steam-steam-windows",
        uses: "@pipelab/plugin-steam/steam-upload",
        needs: ["b1-windows-x64"],
      },
      { id: "itch-itch-linux", uses: "@pipelab/plugin-itch/itch-upload", needs: ["b2-linux-x64"] },
    ]);
  });
});

describe("Construct to a ZIP bundle of Electron and Tauri builds with manually chosen inputs", () => {
  // Story: a release manager zips the Windows, Linux and macOS builds into one archive, leaving out the extra Linux Electron target.
  const bundleConfig = () =>
    scenario(
      constructSource,
      [zipDestination(out("bundle", "zip"))],
      [
        constructWebBuild(),
        electronBuild("desktop-electron", out("construct-web", "web"), [
          "windows-x64",
          "linux-x64",
        ]),
        tauriBuild("tauri-linux", out("construct-web", "web"), ["linux-x64"]),
        tauriBuild("tauri-macos", out("construct-web", "web"), ["macos-arm64"]),
        bundleBuild([
          out("desktop-electron", "windows-x64"),
          out("tauri-linux", "linux-x64"),
          out("tauri-macos", "macos-arm64"),
        ]),
      ],
    );

  it("bundles the three chosen outputs and compiles nothing for the exposed but unused Electron Linux target", () => {
    const { resolved, plan, steps } = resolveAndCompile(bundleConfig());
    expect(errorsOf(plan)).toEqual([]);
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["windows-x64", "linux-x64"], input: "b0.web" },
      { engine: "tauri", enabledTargets: ["linux-x64"], input: "b0.web" },
      { engine: "tauri", enabledTargets: ["macos-arm64"], input: "b0.web" },
      { engine: "core/bundle", enabledTargets: ["zip"], input: "implicit" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "zip", slot: "bundle", input: "b4.zip" },
    ]);
    expect(steps.map((step) => step.id)).toEqual([
      "release-construct-source",
      "b0-web-export",
      "b0-web-extract",
      "b1-windows-x64",
      "b2-linux-x64",
      "b3-macos-arm64",
      "b4-input-b1-windows-x64",
      "b4-input-b2-linux-x64",
      "b4-input-b3-macos-arm64",
      "b4-output",
      "release-zip-zip-b4",
    ]);
  });
});

describe("Demo and full Electron builds: two Steam destinations, each reading its own build", () => {
  // Story: the demo and the full game are built from the same project with different settings and uploaded to separate Steam apps.
  const config = () =>
    scenario(
      constructSource,
      [
        steamDestination(
          "steam-demo",
          "480200",
          slot("windows", { depotId: "480201" }, out("electron-demo", "windows-x64")),
        ),
        steamDestination(
          "steam-full",
          "480100",
          slot("windows", { depotId: "480101" }, out("electron-full", "windows-x64")),
        ),
      ],
      [
        constructWebBuild(),
        electronBuild("electron-demo", out("construct-web", "web"), ["windows-x64"], undefined, {
          edition: "demo",
        }),
        electronBuild("electron-full", out("construct-web", "web"), ["windows-x64"], undefined, {
          edition: "full",
        }),
      ],
    );

  it("keeps both explicit builds, compiles them with their own settings and distinct step ids", () => {
    const { resolved, workflow, steps } = resolveAndCompile(config());
    expect(resolved).toEqual(config());
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["windows-x64"], input: "b0.web" },
      { engine: "electron", enabledTargets: ["windows-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam-demo", slot: "windows", input: "b1.windows-x64" },
      { destination: "steam-full", slot: "windows", input: "b2.windows-x64" },
    ]);
    expect(steps.map((step) => step.id)).toEqual([
      "release-construct-source",
      "b0-web-export",
      "b0-web-extract",
      "b1-windows-x64",
      "b2-windows-x64",
      "steam-steam-demo-windows",
      "steam-steam-full-windows",
    ]);
    const electronSettings = workflow.steps
      .filter((step) => step.uses === ELECTRON_STEP)
      .map((step) => [normalizeIds(step.id, resolved), step.with?.edition]);
    expect(electronSettings).toEqual([
      ["b1-windows-x64", "demo"],
      ["b2-windows-x64", "full"],
    ]);
  });
});

describe("Stability: user edits after defaults ran never rewrite explicit inputs or existing builds", () => {
  // Story: the release is defaulted once, then the user keeps editing it and defaults must not undo their work.
  const defaulted = () =>
    resolveReleaseDefaults(
      scenario(constructSource, [
        steamDestination("steam", "480100", slot("windows", { depotId: "480101" })),
      ]),
      realRegistry,
      planning(linux),
    );

  it("starts from the defaulted Construct to Steam chain", () => {
    const base = defaulted();
    expect(summarizeBuilds(base)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(base)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
    ]);
  });

  it("fills a newly added empty Folder slot and leaves every existing build and slot as it was", () => {
    const base = defaulted();
    const edited = {
      ...base,
      destinations: [...base.destinations, folderDestination(slot("output"))],
    };
    const resolved = resolveReleaseDefaults(edited, realRegistry, planning(linux));
    expect(resolved.builds.slice(0, base.builds.length)).toEqual(base.builds);
    expect(resolved.destinations.slice(0, base.destinations.length)).toEqual(base.destinations);
    expect(resolved.destinations[1].slots[0].input).toBeDefined();
    expect(resolveReleaseDefaults(resolved, realRegistry, planning(linux))).toEqual(resolved);
  });

  it("does not re-add a removed Electron build while the Steam slot still points at it", () => {
    const base = defaulted();
    const electron = base.builds.find((build) => build.engine === ELECTRON_PRODUCER);
    const webBuild = base.builds.find((build) => build.engine === CONSTRUCT_PRODUCER);
    const edited = { ...base, builds: base.builds.filter((build) => build !== electron) };
    const resolved = resolveReleaseDefaults(edited, realRegistry, planning(linux));
    expect(resolved.builds).toEqual([webBuild]);
    expect(resolved.destinations[0].slots[0].input).toEqual(base.destinations[0].slots[0].input);
    expect(resolveReleaseDefaults(resolved, realRegistry, planning(linux))).toEqual(resolved);
  });

  it("keeps an explicit input on a new Poki slot and leaves the existing builds unchanged", () => {
    const base = defaulted();
    const webBuild = base.builds.find((build) => build.engine === CONSTRUCT_PRODUCER)!;
    const explicit = out(webBuild.id, "web");
    const edited = {
      ...base,
      destinations: [...base.destinations, pokiDestination(slot("web", {}, explicit))],
    };
    const resolved = resolveReleaseDefaults(edited, realRegistry, planning(linux));
    expect(resolved.builds).toEqual(base.builds);
    expect(resolved.destinations[1].slots[0].input).toEqual(explicit);
    expect(resolveReleaseDefaults(resolved, realRegistry, planning(linux))).toEqual(resolved);
  });
});

/** FAKE Capacitor: turns a web application folder into an Android App Bundle on hosts with the Android SDK. */
const capacitorAab: ArtifactDescriptor = {
  kind: "application",
  technology: "capacitor",
  platform: "android",
  container: "file",
  format: "aab",
};

const fakeCapacitor: ReleaseProducerDefinition = {
  id: FAKE_CAPACITOR,
  label: "Capacitor (fake)",
  planning: { mode: "build" },
  accepts: { kind: "application", platform: "web", container: "directory" },
  targets: [
    {
      id: "android-aab",
      label: "Android App Bundle",
      buildType: "mobile",
      output: capacitorAab,
      createDefaultConfig: () => ({}),
      isAvailable: (host) =>
        host.androidSdk === true
          ? { available: true }
          : { available: false, reason: "Android SDK required" },
    },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => ({
    steps: config.targets
      .filter((target) => target.enabled)
      .map((target) => ({
        id: `${config.id}-${target.id}`,
        uses: "@pipelab/fake-capacitor/build-aab",
        needs: [input.reference.stepId],
        artifactInputs: { "input-folder": input.reference },
        with: { ...config.config, ...target.config },
        artifacts: { output: { descriptor: capacitorAab } },
      })),
    artifacts: Object.fromEntries(
      config.targets
        .filter((target) => target.enabled)
        .map((target) => [
          target.id,
          {
            reference: { stepId: `${config.id}-${target.id}`, artifact: "output" },
            descriptor: capacitorAab,
          },
        ]),
    ),
  }),
};

/** FAKE Google Play: accepts an application file or archive and uploads it with a Play account. */
const fakePlayStore: ReleaseDestinationDefinition = {
  id: FAKE_PLAY_STORE,
  label: "Google Play (fake)",
  accepts: { kind: "application", container: ["file", "archive"] },
  fields: [
    {
      key: "credentials",
      type: "connection",
      integration: "google-play",
      label: "Play Console account",
      required: true,
    },
  ],
  createDefaultConfig: () => ({ credentials: "" }),
  validate: (item) =>
    typeof item.config.credentials === "string" && item.config.credentials
      ? []
      : [
          {
            code: "play.credentials.required",
            message: "A Play Console account is required.",
            severity: "error",
            path: "config.credentials",
          },
        ],
  compile: (artifact, item, current) => [
    {
      id: `play-${item.id}-${current.id}`,
      uses: "@pipelab/fake-play-store/upload",
      needs: [artifact.reference.stepId],
      artifactInputs: { file: artifact.reference },
      with: { ...item.config, ...current.config },
      delivery: { destinationId: item.id, slotId: current.id, artifact: artifact.reference },
    },
  ],
};

/** FAKE Cloudflare Pages: serves a web application folder. */
const fakePages: ReleaseDestinationDefinition = {
  id: FAKE_PAGES,
  label: "Cloudflare Pages (fake)",
  accepts: { kind: "application", platform: "web", container: "directory" },
  fields: [{ key: "project", type: "text", label: "Pages project", required: true }],
  createDefaultConfig: () => ({ project: "" }),
  validate: (item) =>
    typeof item.config.project === "string" && item.config.project
      ? []
      : [
          {
            code: "pages.project.required",
            message: "A Pages project is required.",
            severity: "error",
            path: "config.project",
          },
        ],
  compile: (artifact, item, current) => [
    {
      id: `pages-${item.id}-${current.id}`,
      uses: "@pipelab/fake-cloudflare-pages/deploy",
      needs: [artifact.reference.stepId],
      artifactInputs: { folder: artifact.reference },
      with: { ...item.config, ...current.config },
      delivery: { destinationId: item.id, slotId: current.id, artifact: artifact.reference },
    },
  ],
};

const fakeRegistry: ReleaseRegistry = {
  sources: realRegistry.sources,
  producers: [...realRegistry.producers, fakeCapacitor],
  destinations: [...realRegistry.destinations, fakePlayStore, fakePages],
};

describe("FAKE Capacitor to Google Play: planning depends on the host having the Android SDK", () => {
  // Story: an Android build is only possible on a machine with the Android SDK; elsewhere the release says why it cannot run.
  const androidConfig = () =>
    scenario(
      constructSource,
      [
        destination("play", FAKE_PLAY_STORE, { credentials: "play-account" }, [
          slot("production", {}, out("capacitor-build", "android-aab")),
        ]),
      ],
      [
        constructWebBuild(),
        {
          id: "capacitor-build",
          type: "mobile",
          engine: FAKE_CAPACITOR,
          enabled: true,
          input: out("construct-web", "web"),
          config: {},
          targets: targetsOf(["android-aab"]),
        },
      ],
    );

  it("plans cleanly and compiles the Capacitor bundle on a host with the Android SDK", () => {
    const host = { platform: "linux", architecture: "x64", androidSdk: true };
    const { resolved, steps } = resolveAndCompile(androidConfig(), host, fakeRegistry);
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "fake-capacitor", enabledTargets: ["android-aab"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "play", slot: "production", input: "b1.android-aab" },
    ]);
    expect(steps).toEqual([
      { id: "release-construct-source", uses: "@pipelab/core/passthrough", needs: [] },
      { id: "b0-web-export", uses: CONSTRUCT_EXPORT_STEP, needs: [] },
      { id: "b0-web-extract", uses: "@pipelab/core/archive/unzip", needs: ["b0-web-export"] },
      {
        id: "b1-android-aab",
        uses: "@pipelab/fake-capacitor/build-aab",
        needs: ["b0-web-extract"],
      },
      {
        id: "play-play-production",
        uses: "@pipelab/fake-play-store/upload",
        needs: ["b1-android-aab"],
      },
    ]);
  });

  it("fails planning with the unavailable-target issue and its reason on a host without the Android SDK", () => {
    const host = { platform: "linux", architecture: "x64", androidSdk: false };
    const { resolved, plan } = resolveAndPlan(androidConfig(), host, fakeRegistry);
    expect(
      errorsOf(plan).map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    ).toEqual([
      {
        code: "release.build.target.unavailable",
        path: "builds.1.targets.0",
        message: "Android SDK required",
      },
    ]);
    expect(resolveReleaseDefaults(resolved, fakeRegistry, planning(host))).toEqual(resolved);
  });
});

describe("One project, web and desktop: a shared Construct web export feeds Cloudflare Pages and Electron", () => {
  // Story: the web build is published to a web host and also packaged for itch.io, with one shared export.
  it("compiles the Construct web export once and both consumers depend on it", () => {
    const configured = scenario(
      constructSource,
      [
        destination("pages", FAKE_PAGES, { project: "space-game" }, [
          slot("web", {}, out("construct-web", "web")),
        ]),
        itchDestination(
          slot("windows", { channel: "windows" }, out("desktop-electron", "windows-x64")),
        ),
      ],
      [
        constructWebBuild(),
        electronBuild("desktop-electron", out("construct-web", "web"), ["windows-x64"]),
      ],
    );
    const { resolved, steps } = resolveAndCompile(configured, linux, fakeRegistry);
    expect(resolved).toEqual(configured);
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["windows-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "pages", slot: "web", input: "b0.web" },
      { destination: "itch", slot: "windows", input: "b1.windows-x64" },
    ]);
    expect(steps.filter((step) => step.uses === CONSTRUCT_EXPORT_STEP)).toHaveLength(1);
    expect(steps.map((step) => [step.id, step.needs])).toEqual([
      ["release-construct-source", []],
      ["b0-web-export", []],
      ["b0-web-extract", ["b0-web-export"]],
      ["b1-windows-x64", ["b0-web-extract"]],
      ["pages-pages-web", ["b0-web-extract"]],
      ["itch-itch-windows", ["b1-windows-x64"]],
    ]);
  });
});
