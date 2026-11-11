import { describe, expect, it } from "vitest";
import {
  compileReleasePlan,
  createReleaseConfig,
  planRelease,
  resolveReleaseDefaults,
  type ReleaseBuildProfileConfig,
  type ReleaseConfig,
  type ReleaseDestinationConfig,
  type ReleaseDestinationSlot,
  type ReleaseOutputRef,
  type ReleasePlan,
} from "@pipelab/shared";
import { buildHostNeutralRegistry } from "./test-registry";

/**
 * Real-world release scenarios resolved against the built-in registry: Construct, Godot, Electron,
 * Tauri, Steam, itch, Poki, Pipelab Cloud and the core Folder and ZIP providers.
 */

const host = { platform: "linux", architecture: "x64" };
const context = { host };
const registry = buildHostNeutralRegistry();

type Destination = ReleaseDestinationConfig;

const constructSource: ReleaseConfig["source"] = {
  provider: "@pipelab/plugin-construct/source",
  config: {
    path: "/games/space/space.c3p",
    profilePath: "/profiles/construct",
    accountConnectionId: "",
    version: "",
  },
};

const godotSource: ReleaseConfig["source"] = {
  provider: "@pipelab/plugin-godot/source",
  config: { path: "/games/godot-game" },
};

/** A release config with the given source; builds and destinations default to none. */
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
  enabled = true,
): ReleaseDestinationSlot => ({ id, enabled, config, ...(input ? { input } : {}) });

/** Steam: one slot per depot. */
const steam = (...slots: ReleaseDestinationSlot[]): Destination => ({
  id: "steam",
  provider: "@pipelab/plugin-steam/destination",
  enabled: true,
  config: { accountConnectionId: "steam-account", appId: "480100", description: "" },
  slots,
});

/** itch: one slot per channel. */
const itch = (...slots: ReleaseDestinationSlot[]): Destination => ({
  id: "itch",
  provider: "@pipelab/plugin-itch/destination",
  enabled: true,
  config: { accountConnectionId: "itch-account", project: "space-game" },
  slots,
});

const poki = (): Destination => ({
  id: "poki",
  provider: "@pipelab/plugin-poki/destination",
  enabled: true,
  config: { project: "space-game", name: "1.0.0", notes: "Weekly build" },
  slots: [slot("web")],
});

const pipelabCloud = (): Destination => ({
  id: "cloud",
  provider: "@pipelab/pipelab-cloud/destination",
  enabled: true,
  config: {},
  slots: [slot("archive")],
});

const CONSTRUCT_DESKTOP_TARGETS = [
  "webview2-windows-x64",
  "wkwebview-macos-arm64",
  "cef-linux-x64",
];

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
  return config.destinations.flatMap((destination) =>
    destination.slots.map((item) => ({
      destination: destination.id,
      slot: item.id,
      input: item.input ? refName(item.input, names) : "empty",
    })),
  );
};

const errorsOf = (plan: ReleasePlan) => plan.issues.filter((issue) => issue.severity === "error");

/** Replaces generated build ids in compiled text with their stable `bN` names. */
const normalizeIds = (text: string, config: ReleaseConfig) =>
  [...buildNames(config)].reduce((value, [id, name]) => value.split(id).join(name), text);

/** Compiled steps as `{id, uses, needs}` with generated build ids replaced by stable names. */
const summarizeSteps = (
  config: ReleaseConfig,
  steps: ReturnType<typeof compileReleasePlan>["steps"],
) =>
  steps.map((step) => ({
    id: normalizeIds(step.id, config),
    uses: step.uses,
    needs: (step.needs ?? []).map((need) => normalizeIds(need, config)),
  }));

/** Resolves defaults and plans; the caller decides what a clean plan means for its scenario. */
const resolveAndPlan = (config: ReleaseConfig) => {
  const resolved = resolveReleaseDefaults(config, registry, context);
  const plan = planRelease(resolved, registry, context);
  return { resolved, plan };
};

/**
 * Resolves defaults, asserts a plan with zero error issues, compiles it and asserts that a second
 * resolve over its own output changes nothing.
 */
const resolveAndCompile = (config: ReleaseConfig) => {
  const { resolved, plan } = resolveAndPlan(config);
  expect(errorsOf(plan)).toEqual([]);
  const workflow = compileReleasePlan(resolved, plan, registry, context);
  expect(resolveReleaseDefaults(resolved, registry, context)).toEqual(resolved);
  return { resolved, plan, steps: summarizeSteps(resolved, workflow.steps) };
};

describe("Construct to Steam: Electron chained from the Construct web export", () => {
  it("adds one Construct web build and one Electron Windows build that Steam reads", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(constructSource, [steam(slot("windows", { depotId: "480101" }))]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
    ]);
    expect(steps).toEqual([
      { id: "release-construct-source", uses: "@pipelab/core/passthrough", needs: [] },
      // The Construct export reads the project from the source config, so it has no needs edge.
      {
        id: "b0-web-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
        needs: [],
      },
      { id: "b0-web-extract", uses: "@pipelab/core/archive/unzip", needs: ["b0-web-export"] },
      {
        id: "b1-linux-x64",
        uses: "@pipelab/plugin-electron/electron:package:v2",
        needs: ["b0-web-extract"],
      },
      {
        id: "steam-steam-windows",
        uses: "@pipelab/plugin-steam/steam-upload",
        needs: ["b1-linux-x64"],
      },
    ]);
  });
});

describe("Construct to Poki: the web build alone, no Electron", () => {
  it("adds only the Construct web build and Poki reads it", () => {
    const { resolved, plan, steps } = resolveAndCompile(scenario(constructSource, [poki()]));
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
    expect(plan.producers.map((producer) => producer.input)).toEqual([{ source: true }]);
    expect(steps.map((step) => step.uses)).toEqual([
      "@pipelab/core/passthrough",
      "@pipelab/plugin-construct/export-construct-project",
      "@pipelab/core/archive/unzip",
      "@pipelab/plugin-poki/poki-upload",
    ]);
  });
});

describe("Construct to Steam, itch and Poki together: one web build and one Electron build", () => {
  it("shares one web build and one Electron build across all three destinations", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(constructSource, [
        steam(slot("windows", { depotId: "480101" })),
        itch(slot("windows", { channel: "windows" })),
        poki(),
      ]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    // Steam reads the Electron build. itch accepts both the web and the Electron output, and reuse
    // prefers the desktop build type (earlier in the defaults table) over the web build.
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
      { destination: "itch", slot: "windows", input: "b1.linux-x64" },
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
    expect(steps.filter((step) => step.uses.includes("construct"))).toHaveLength(1);
    expect(steps.filter((step) => step.uses.includes("electron"))).toHaveLength(1);
    expect(steps.map((step) => step.id)).toEqual([
      "release-construct-source",
      "b0-web-export",
      "b0-web-extract",
      "b1-linux-x64",
      "steam-steam-windows",
      "itch-itch-windows",
      "poki-poki-web",
    ]);
  });
});

describe("Construct to Steam with two depot slots: both slots read the same Electron build", () => {
  it("chains one Electron build and reuses it for the second slot", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(constructSource, [
        steam(slot("windows", { depotId: "480101" }), slot("windows-beta", { depotId: "480102" })),
      ]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
      { destination: "steam", slot: "windows-beta", input: "b1.linux-x64" },
    ]);
    expect(steps.map((step) => [step.id, step.needs])).toEqual([
      ["release-construct-source", []],
      ["b0-web-export", []],
      ["b0-web-extract", ["b0-web-export"]],
      ["b1-linux-x64", ["b0-web-extract"]],
      ["steam-steam-windows", ["b1-linux-x64"]],
      ["steam-steam-windows-beta", ["b1-linux-x64"]],
    ]);
  });
});

/** A Godot web build the user configured with an export preset (Godot presets cannot be defaulted). */
const godotWebBuild: ReleaseBuildProfileConfig = {
  id: "godot-web",
  type: "web",
  engine: "@pipelab/plugin-godot/producer",
  enabled: true,
  input: { source: true },
  config: {},
  targets: [{ id: "web", enabled: true, config: { preset: "Web" } }],
};

describe("Godot to Steam: Godot's native desktop export, not Electron", () => {
  it("builds the Godot desktop export from the source beside the user-configured Godot web build", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(godotSource, [steam(slot("windows", { depotId: "480101" }))], [godotWebBuild]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "godot", enabledTargets: ["web"], input: "source" },
      { engine: "godot", enabledTargets: ["linux-x64"], input: "source" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
    ]);
    // The configured web build feeds no destination, so only the desktop export is compiled.
    expect(steps.map((step) => [step.id, step.needs])).toEqual([
      ["release-godot-source", []],
      ["b1-linux-x64", ["release-godot-source"]],
      ["steam-steam-windows", ["b1-linux-x64"]],
    ]);
  });

  it("adds the Godot desktop export by itself when no Godot build is configured", () => {
    const { resolved } = resolveAndCompile(
      scenario(godotSource, [steam(slot("windows", { depotId: "480101" }))]),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "godot", enabledTargets: ["linux-x64"], input: "source" },
    ]);
  });
});

describe("Godot to Poki: Poki reads the Godot web export directly", () => {
  it("reads the user-configured Godot web build without adding Electron", () => {
    const { resolved, steps } = resolveAndCompile(scenario(godotSource, [poki()], [godotWebBuild]));
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "godot", enabledTargets: ["web"], input: "source" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
    expect(steps.map((step) => step.id)).toEqual([
      "release-godot-source",
      "b0-web",
      "poki-poki-web",
    ]);
  });

  it("adds the Godot web default by itself when no Godot build is configured", () => {
    const { resolved } = resolveAndCompile(scenario(godotSource, [poki()]));
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
  });
});

describe("Folder and web folder sources: no chain where the source already fits", () => {
  it("Folder source to Steam: no producer accepts a files output, so the slot stays empty", () => {
    // The Folder source is a plain file tree (kind "files"). Electron and Steam only accept
    // application outputs, so no default chain exists and the planner asks for the input.
    const { resolved, plan } = resolveAndPlan(
      scenario({ provider: "@pipelab/core/source/folder", config: { path: "/games/space" } }, [
        steam(slot("windows", { depotId: "480101" })),
      ]),
    );
    expect(summarizeBuilds(resolved)).toEqual([]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "empty" },
    ]);
    expect(errorsOf(plan).map((issue) => issue.code)).toEqual([
      "release.destination.input.required",
    ]);
  });

  it("Web folder source to Poki: no builds at all, Poki reads the source", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(
        { provider: "@pipelab/core/source/web-folder", config: { path: "/games/space-web" } },
        [poki()],
      ),
    );
    expect(summarizeBuilds(resolved)).toEqual([]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "poki", slot: "web", input: "source" },
    ]);
    expect(steps.map((step) => step.uses)).toEqual([
      "@pipelab/core/fs/copy",
      "@pipelab/plugin-poki/poki-upload",
    ]);
  });
});

describe("Construct with a user-configured Tauri desktop build and an empty Steam slot", () => {
  it("reuses the Tauri output for Steam and adds no Electron build", () => {
    const userBuilds: ReleaseBuildProfileConfig[] = [
      {
        id: "user-web",
        type: "web",
        engine: "@pipelab/plugin-construct/producer",
        enabled: true,
        input: { source: true },
        config: {},
        targets: [{ id: "web", enabled: true, config: {} }],
      },
      {
        id: "user-tauri",
        type: "desktop",
        engine: "@pipelab/plugin-tauri/producer",
        enabled: true,
        input: { buildId: "user-web", targetId: "web" },
        config: {},
        targets: [{ id: "windows-x64", enabled: true, config: {} }],
      },
    ];
    const config = scenario(
      constructSource,
      [steam(slot("windows", { depotId: "480101" }))],
      userBuilds,
    );
    const { resolved, steps } = resolveAndCompile(config);

    expect(resolved.builds).toEqual(userBuilds);
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "tauri", enabledTargets: ["windows-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.windows-x64" },
    ]);
    expect(steps.map((step) => step.uses)).not.toContain(
      "@pipelab/plugin-electron/electron:package:v2",
    );
  });
});

describe("Construct with the auto-added web build removed and the Steam slot still empty", () => {
  it("re-adds the same web and Electron chain (current behaviour)", () => {
    // Current behaviour: the defaults run on every resolve, so removing the builds in the editor
    // and leaving the slot empty brings the default chain back.
    const { resolved } = resolveAndCompile(
      scenario(constructSource, [steam(slot("windows", { depotId: "480101" }))], []),
    );
    expect(summarizeBuilds(resolved)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
    ]);
  });
});

describe("Construct desktop targets (webview2, wkwebview, cef)", () => {
  it("are never auto-added for Steam, itch, Poki or Pipelab Cloud", () => {
    const { resolved } = resolveAndCompile(
      scenario(constructSource, [
        steam(slot("windows", { depotId: "480101" })),
        itch(slot("windows", { channel: "windows" })),
        poki(),
        pipelabCloud(),
      ]),
    );
    const enabled = summarizeBuilds(resolved).flatMap((build) => build.enabledTargets);
    expect(enabled).toEqual(["web", "linux-x64"]);
    expect(enabled.some((target) => CONSTRUCT_DESKTOP_TARGETS.includes(target))).toBe(false);
  });

  it.each(CONSTRUCT_DESKTOP_TARGETS)(
    "explicitly enabling %s fails planning with an unavailable-target error",
    (targetId) => {
      const config = scenario(
        constructSource,
        [],
        [
          {
            id: "construct-desktop",
            type: "desktop",
            engine: "@pipelab/plugin-construct/producer",
            enabled: true,
            input: { source: true },
            config: {},
            targets: [{ id: targetId, enabled: true, config: {} }],
          },
        ],
      );
      const { plan } = resolveAndPlan(config);
      expect(errorsOf(plan).map((issue) => ({ code: issue.code, path: issue.path }))).toEqual([
        { code: "release.build.target.unavailable", path: "builds.0.targets.0" },
      ]);
    },
  );
});

describe("Disabled destinations, disabled slots and explicit inputs", () => {
  it("gives a disabled destination no builds", () => {
    const { resolved, steps } = resolveAndCompile(
      scenario(constructSource, [
        { ...steam(slot("windows", { depotId: "480101" })), enabled: false },
      ]),
    );
    expect(resolved.builds).toEqual([]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "empty" },
    ]);
    expect(steps.map((step) => step.uses)).toEqual(["@pipelab/core/passthrough"]);
  });

  it("gives a disabled slot no builds while the enabled empty slot after it is filled", () => {
    const { resolved } = resolveAndCompile(
      scenario(constructSource, [
        steam(
          slot("windows-beta", { depotId: "480102" }),
          slot("windows", { depotId: "480101" }, undefined, false),
        ),
      ]),
    );
    expect(summarizeBuilds(resolved).map((build) => build.engine)).toEqual([
      "construct",
      "electron",
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows-beta", input: "b1.linux-x64" },
      { destination: "steam", slot: "windows", input: "empty" },
    ]);
  });

  it("fills an enabled empty slot that comes after a disabled slot of the same destination", () => {
    const { resolved } = resolveAndCompile(
      scenario(constructSource, [
        steam(
          slot("windows", { depotId: "480101" }, undefined, false),
          slot("windows-beta", { depotId: "480102" }),
        ),
      ]),
    );
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "empty" },
      { destination: "steam", slot: "windows-beta", input: "b1.linux-x64" },
    ]);
  });

  it("reports a destination whose only slot is disabled instead of filling it", () => {
    const { resolved, plan } = resolveAndPlan(
      scenario(constructSource, [steam(slot("windows", { depotId: "480101" }, undefined, false))]),
    );
    expect(resolved.builds).toEqual([]);
    expect(errorsOf(plan).map((issue) => issue.code)).toEqual([
      "release.destination.slot.required",
    ]);
  });

  it("leaves a slot with an explicit input untouched and only fills the empty slot", () => {
    const userBuilds: ReleaseBuildProfileConfig[] = [
      {
        id: "web-build",
        type: "web",
        engine: "@pipelab/plugin-construct/producer",
        enabled: true,
        input: { source: true },
        config: {},
        targets: [{ id: "web", enabled: true, config: {} }],
      },
      {
        id: "electron-build",
        type: "desktop",
        engine: "@pipelab/plugin-electron/producer",
        enabled: true,
        input: { buildId: "web-build", targetId: "web" },
        config: {},
        targets: [{ id: "windows-x64", enabled: true, config: {} }],
      },
    ];
    const explicitSteamInput = { buildId: "electron-build", targetId: "windows-x64" };
    const config = scenario(
      constructSource,
      [steam(slot("windows", { depotId: "480101" }, explicitSteamInput)), poki()],
      userBuilds,
    );
    const { resolved } = resolveAndCompile(config);

    expect(resolved.builds).toEqual(userBuilds);
    expect(resolved.destinations[0].slots[0].input).toEqual(explicitSteamInput);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "steam", slot: "windows", input: "b1.windows-x64" },
      { destination: "poki", slot: "web", input: "b0.web" },
    ]);
  });
});

describe("Order independence of destinations that need the same chain", () => {
  it("builds the same chain whether Steam or Poki is resolved first", () => {
    const steamFirst = resolveAndCompile(
      scenario(constructSource, [steam(slot("windows", { depotId: "480101" })), poki()]),
    ).resolved;
    const pokiFirst = resolveAndCompile(
      scenario(constructSource, [poki(), steam(slot("windows", { depotId: "480101" }))]),
    ).resolved;

    // Defaults always store explicit inputs, so the saved builds do not depend on resolution order.
    expect(summarizeBuilds(pokiFirst)).toEqual(summarizeBuilds(steamFirst));
    expect(summarizeBuilds(steamFirst)).toEqual([
      { engine: "construct", enabledTargets: ["web"], input: "source" },
      { engine: "electron", enabledTargets: ["linux-x64"], input: "b0.web" },
    ]);
    expect(summarizeSlots(pokiFirst)).toEqual([
      { destination: "poki", slot: "web", input: "b0.web" },
      { destination: "steam", slot: "windows", input: "b1.linux-x64" },
    ]);
  });
});

/** A ZIP destination whose only slot reads the given output. */
const zipDestination = (input?: ReleaseOutputRef): Destination => ({
  id: "zip",
  provider: "@pipelab/core/destination/zip",
  enabled: true,
  config: {},
  slots: [slot("bundle", { outputPath: "/output/space-release.zip" }, input)],
});

const BUNDLE_PROVIDER = "@pipelab/core/bundle";

/** Construct web export, Electron Windows and two Tauri desktop builds, all reading the web export. */
const bundleBuilds = (): ReleaseBuildProfileConfig[] => [
  {
    id: "construct-web",
    type: "web",
    engine: "@pipelab/plugin-construct/producer",
    enabled: true,
    input: { source: true },
    config: {},
    targets: [{ id: "web", enabled: true, config: {} }],
  },
  {
    id: "electron",
    type: "desktop",
    engine: "@pipelab/plugin-electron/producer",
    enabled: true,
    input: { buildId: "construct-web", targetId: "web" },
    config: {},
    targets: [{ id: "windows-x64", enabled: true, config: {} }],
  },
  {
    id: "tauri-linux",
    type: "desktop",
    engine: "@pipelab/plugin-tauri/producer",
    enabled: true,
    input: { buildId: "construct-web", targetId: "web" },
    config: {},
    targets: [{ id: "linux-x64", enabled: true, config: {} }],
  },
  {
    id: "tauri-macos",
    type: "desktop",
    engine: "@pipelab/plugin-tauri/producer",
    enabled: true,
    input: { buildId: "construct-web", targetId: "web" },
    config: {},
    targets: [{ id: "macos-arm64", enabled: true, config: {} }],
  },
  {
    id: "bundle",
    type: "bundle",
    engine: BUNDLE_PROVIDER,
    enabled: true,
    inputs: [
      { buildId: "electron", targetId: "windows-x64" },
      { buildId: "tauri-linux", targetId: "linux-x64" },
      { buildId: "tauri-macos", targetId: "macos-arm64" },
    ],
    config: {},
    targets: [{ id: "zip", enabled: true, config: {} }],
  },
];

describe("Construct to a ZIP bundle of Electron and Tauri desktop builds", () => {
  it("bundles three explicit desktop outputs into one ZIP read by the ZIP destination", () => {
    const { resolved, plan, steps } = resolveAndCompile(
      scenario(
        constructSource,
        [zipDestination({ buildId: "bundle", targetId: "zip" })],
        bundleBuilds(),
      ),
    );
    expect(errorsOf(plan)).toEqual([]);
    expect(summarizeBuilds(resolved).map((build) => build.engine)).toEqual([
      "construct",
      "electron",
      "tauri",
      "tauri",
      "core/bundle",
    ]);
    expect(summarizeSlots(resolved)).toEqual([
      { destination: "zip", slot: "bundle", input: "b4.zip" },
    ]);
    const ids = steps.map((step) => step.id);
    // Every input's producing step finishes before its staging copy, and the ZIP waits for all copies.
    expect(ids).toEqual([
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
    expect(steps.find((step) => step.id === "b4-output")?.needs).toEqual([
      "b4-input-b1-windows-x64",
      "b4-input-b2-linux-x64",
      "b4-input-b3-macos-arm64",
    ]);
    expect(steps.find((step) => step.id === "release-zip-zip-b4")?.needs).toEqual(["b4-output"]);
  });
});

describe("Bundle defaults: resolution never adds or alters a bundle", () => {
  it("leaves a complete bundle configuration untouched and idempotent", () => {
    const config = scenario(
      constructSource,
      [zipDestination({ buildId: "bundle", targetId: "zip" })],
      bundleBuilds(),
    );
    const resolved = resolveReleaseDefaults(config, registry, context);
    expect(resolved).toEqual(config);
    expect(resolveReleaseDefaults(resolved, registry, context)).toEqual(resolved);
  });

  it("never auto-adds a bundle for an empty destination slot", () => {
    const config = scenario(constructSource, [
      steam(slot("windows", { depotId: "480101" })),
      zipDestination(),
    ]);
    const resolved = resolveReleaseDefaults(config, registry, context);
    expect(resolved.builds.map((build) => build.engine)).not.toContain(BUNDLE_PROVIDER);
    expect(resolved.builds.some((build) => build.type === "bundle")).toBe(false);
  });
});

describe("Bundle with a missing input build", () => {
  it("fails the plan when one input build is removed", () => {
    const builds = bundleBuilds().filter((build) => build.id !== "tauri-macos");
    const config = scenario(
      constructSource,
      [zipDestination({ buildId: "bundle", targetId: "zip" })],
      builds,
    );
    const { plan } = resolveAndPlan(config);
    // The missing input is reported once per place the planner resolves that reference.
    expect([...new Set(errorsOf(plan).map((issue) => issue.code))]).toEqual([
      "release.build.reference.disabled",
    ]);
  });
});
