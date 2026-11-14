import { describe, expect, it } from "vitest";
import { resolveReleaseDefaults } from "./preferences";
import type { ReleaseDefaultEntry } from "./defaults";
import { planRelease } from "./planner";
import type {
  ReleaseBuildProfileConfig,
  ReleaseConfig,
  ReleaseDestinationDefinition,
  ReleaseProducerDefinition,
  ReleaseProducerTargetDefinition,
  ReleaseRegistry,
  ReleaseSourceDefinition,
} from "./types";

const project = (technology: string) =>
  ({ kind: "project", technology, container: "directory" }) as const;
const windowsApp = { kind: "application", platform: "windows", container: "directory" } as const;
const linuxApp = { kind: "application", platform: "linux", container: "directory" } as const;
const webApp = { kind: "application", platform: "web", container: "directory" } as const;

const source = (
  id: string,
  output: ReleaseSourceDefinition["output"],
): ReleaseSourceDefinition => ({
  id,
  label: id,
  output,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifact: null as never }),
});

const target = (
  id: string,
  buildType: string,
  output: ReleaseProducerTargetDefinition["output"],
  extra: Partial<ReleaseProducerTargetDefinition> = {},
): ReleaseProducerTargetDefinition => ({
  id,
  label: id,
  buildType,
  output,
  createDefaultConfig: () => ({}),
  ...extra,
});

const engine = (
  id: string,
  accepts: ReleaseProducerDefinition["accepts"],
  targets: ReleaseProducerTargetDefinition[],
): ReleaseProducerDefinition => ({
  id,
  label: id,
  accepts,
  planning: { mode: "build" },
  targets,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifacts: {} }),
});

const destination = (
  accepts: ReleaseDestinationDefinition["accepts"],
  extra: Partial<ReleaseDestinationDefinition> = {},
): ReleaseDestinationDefinition => ({
  id: "fake-destination",
  label: "Fake destination",
  accepts,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => [],
  ...extra,
});

const entry = (
  buildType: string,
  engineId: string,
  targetId: string,
  extra: Partial<ReleaseDefaultEntry> = {},
): ReleaseDefaultEntry => ({ buildType, engine: engineId, target: targetId, ...extra });

const desktopDestination = destination({
  kind: "application",
  platform: ["windows", "linux", "macos"],
  container: "directory",
});
const webDestination = destination({
  kind: "application",
  platform: "web",
  container: "directory",
});

const constructSource = source("construct-project", project("construct"));
const constructWeb = engine("construct-web", project("construct"), [target("web", "web", webApp)]);
const electron = engine("@pipelab/plugin-electron/producer", webApp, [
  target("windows-x64", "desktop", windowsApp),
  target("linux-x64", "desktop", linuxApp),
]);

/** The table used by most tests: desktop from Electron, web from Construct projects. */
const DEFAULTS: ReleaseDefaultEntry[] = [
  entry("desktop", electron.id, "windows-x64"),
  entry("web", constructWeb.id, "web", { source: "construct" }),
];

const registry = (
  producers: ReleaseProducerDefinition[],
  destinations: ReleaseDestinationDefinition[] = [desktopDestination],
  sources: ReleaseSourceDefinition[] = [constructSource],
): ReleaseRegistry => ({ sources, producers, destinations });

const config = (
  sourceProvider = constructSource.id,
  builds: ReleaseConfig["builds"] = [],
): ReleaseConfig => ({
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: sourceProvider, config: {} },
  builds,
  destinations: [
    {
      id: "destination",
      provider: "fake-destination",
      enabled: true,
      config: {},
      slots: [{ id: "slot", enabled: true, config: {} }],
    },
  ],
});

const context = { host: { platform: "linux", architecture: "x64" } };
const slotInput = (resolved: ReleaseConfig) => resolved.destinations[0].slots[0].input;
const slotInputPath = "destinations.0.slots.0.input";
const errorsOf = (resolved: ReleaseConfig, registryValue: ReleaseRegistry) =>
  planRelease(resolved, registryValue, context).issues.filter(
    (issue) => issue.severity === "error",
  );

const existingWeb = (id: string): ReleaseBuildProfileConfig => ({
  id,
  type: "web",
  engine: constructWeb.id,
  config: {},
  targets: [{ id: "web", config: {} }],
});

describe("resolveReleaseDefaults", () => {
  it("chains the web entry into the desktop entry with explicit inputs", () => {
    const registryValue = registry([constructWeb, electron]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, DEFAULTS);

    expect(resolved.builds).toHaveLength(2);
    expect(resolved.builds[0]).toMatchObject({
      engine: constructWeb.id,
      type: "web",
      input: { source: true },
    });
    expect(resolved.builds[1]).toMatchObject({
      engine: electron.id,
      type: "desktop",
      input: { buildId: resolved.builds[0].id, targetId: "web" },
      targets: [
        { id: "windows-x64", config: {} },
        { id: "linux-x64", config: {} },
      ],
    });
    expect(slotInput(resolved)).toEqual({
      buildId: resolved.builds[1].id,
      targetId: "windows-x64",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("adds only the web entry for a web slot, with an explicit source input", () => {
    const registryValue = registry([constructWeb, electron], [webDestination]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, DEFAULTS);

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0]).toMatchObject({
      engine: constructWeb.id,
      type: "web",
      input: { source: true },
    });
    expect(slotInput(resolved)).toEqual({ buildId: resolved.builds[0].id, targetId: "web" });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("adds a single wrapper build with an explicit source input when the source is accepted", () => {
    const webSource = source("web-source", webApp);
    const registryValue = registry([constructWeb, electron], [desktopDestination], [webSource]);
    const resolved = resolveReleaseDefaults(config(webSource.id), registryValue, context, DEFAULTS);

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0]).toMatchObject({
      engine: electron.id,
      input: { source: true },
    });
    expect(slotInput(resolved)).toEqual({
      buildId: resolved.builds[0].id,
      targetId: "windows-x64",
    });
  });

  it("routes a source output through the planner without creating a build when accepted", () => {
    const resolved = resolveReleaseDefaults(
      config(),
      registry([constructWeb, electron], [destination(project("construct"))]),
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toEqual({ source: true });
  });

  it("reuses an existing compatible build instead of adding a duplicate", () => {
    const registryValue = registry([constructWeb, electron]);
    const resolved = resolveReleaseDefaults(
      config(constructSource.id, [existingWeb("manual-web")]),
      registryValue,
      context,
      DEFAULTS,
    );

    expect(resolved.builds.filter((item) => item.engine === constructWeb.id)).toHaveLength(1);
    expect(resolved.builds.filter((item) => item.engine === electron.id)).toHaveLength(1);
    expect(resolved.builds.find((item) => item.engine === electron.id)?.input).toEqual({
      buildId: "manual-web",
      targetId: "web",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("reuses the host target of an existing build rather than another target of it", () => {
    const existingElectron: ReleaseBuildProfileConfig = {
      id: "manual-electron",
      type: "desktop",
      engine: electron.id,
      input: { buildId: "manual-web", targetId: "web" },
      config: {},
      targets: [
        { id: "windows-x64", config: {} },
        { id: "linux-x64", config: {} },
      ],
    };
    const archElectron = engine(electron.id, webApp, [
      target("windows-x64", "desktop", { ...windowsApp, architecture: "x64" }),
      target("linux-x64", "desktop", { ...linuxApp, architecture: "x64" }),
    ]);
    const registryValue = registry([constructWeb, archElectron]);
    const resolve = (platform: string) =>
      resolveReleaseDefaults(
        config(constructSource.id, [existingWeb("manual-web"), existingElectron]),
        registryValue,
        { host: { platform, architecture: "x64" } },
        DEFAULTS,
      );

    expect(slotInput(resolve("linux"))).toEqual({
      buildId: "manual-electron",
      targetId: "linux-x64",
    });
    expect(slotInput(resolve("win32"))).toEqual({
      buildId: "manual-electron",
      targetId: "windows-x64",
    });
  });

  it("reuses an existing web build for a web slot without adding a build", () => {
    const resolved = resolveReleaseDefaults(
      config(constructSource.id, [existingWeb("manual-web")]),
      registry([constructWeb, electron], [webDestination]),
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(1);
    expect(slotInput(resolved)).toEqual({ buildId: "manual-web", targetId: "web" });
  });

  it("prefers an existing desktop output over an earlier web output for a slot that accepts both", () => {
    const existingElectron: ReleaseBuildProfileConfig = {
      id: "manual-electron",
      type: "desktop",
      engine: electron.id,
      input: { buildId: "manual-web", targetId: "web" },
      config: {},
      targets: [{ id: "windows-x64", config: {} }],
    };
    const anyApplication = destination({ kind: "application" });
    const registryValue = registry([constructWeb, electron], [anyApplication]);
    const resolved = resolveReleaseDefaults(
      config(constructSource.id, [existingWeb("manual-web"), existingElectron]),
      registryValue,
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(2);
    expect(slotInput(resolved)).toEqual({ buildId: "manual-electron", targetId: "windows-x64" });
  });

  it("preserves an explicit destination output", () => {
    const explicit = config();
    explicit.destinations[0].slots[0].input = { source: true };

    const resolved = resolveReleaseDefaults(
      explicit,
      registry([constructWeb, electron]),
      context,
      DEFAULTS,
    );

    expect(slotInput(resolved)).toEqual({ source: true });
    expect(resolved.builds).toHaveLength(0);
  });

  it("offers the raw source before an existing build for a slot that accepts both", () => {
    const existingElectron: ReleaseBuildProfileConfig = {
      id: "manual-electron",
      type: "desktop",
      engine: electron.id,
      input: { buildId: "manual-web", targetId: "web" },
      config: {},
      targets: [{ id: "windows-x64", config: {} }],
    };
    const anything = destination({});
    const registryValue = registry([constructWeb, electron], [anything]);
    const resolved = resolveReleaseDefaults(
      config(constructSource.id, [existingWeb("manual-web"), existingElectron]),
      registryValue,
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(2);
    expect(slotInput(resolved)).toEqual({ source: true });
  });

  it("never fills a requiresBuild slot with the raw source, even when the source fits", () => {
    const requiring = destination({}, { requiresBuild: true });
    const registryValue = registry([constructWeb, electron], [requiring]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, []);

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("fills a requiresBuild slot with a default chain instead of the raw source", () => {
    const requiring = destination({}, { requiresBuild: true });
    const registryValue = registry([constructWeb, electron], [requiring]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, DEFAULTS);

    expect(resolved.builds.map((build) => build.engine)).toEqual([constructWeb.id, electron.id]);
    expect(slotInput(resolved)).toEqual({
      buildId: resolved.builds[1].id,
      targetId: "windows-x64",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("adds nothing when the table has no entry for the slot, even if an engine is compatible", () => {
    const resolved = resolveReleaseDefaults(
      config(),
      registry([constructWeb, electron]),
      context,
      [],
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("uses the first viable chain in table order when two entries could fill the slot", () => {
    const first = engine("first-desktop", project("construct"), [
      target("first-windows", "desktop", windowsApp),
    ]);
    const second = engine("second-desktop", project("construct"), [
      target("second-windows", "desktop", windowsApp),
    ]);
    const registryValue = registry([first, second]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, [
      entry("desktop", first.id, "first-windows"),
      entry("desktop", second.id, "second-windows"),
    ]);

    expect(resolved.builds.map((build) => build.engine)).toEqual([first.id]);
    expect(slotInput(resolved)).toEqual({
      buildId: resolved.builds[0].id,
      targetId: "first-windows",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("follows table order rather than declaration order of the producers", () => {
    const first = engine("first-desktop", project("construct"), [
      target("first-windows", "desktop", windowsApp),
    ]);
    const second = engine("second-desktop", project("construct"), [
      target("second-windows", "desktop", windowsApp),
    ]);
    const resolved = resolveReleaseDefaults(config(), registry([first, second]), context, [
      entry("desktop", second.id, "second-windows"),
      entry("desktop", first.id, "first-windows"),
    ]);

    expect(resolved.builds.map((build) => build.engine)).toEqual([second.id]);
  });

  it("prefers a source-specific entry over a generic entry of the same build type", () => {
    const genericWeb = engine("generic-web", project("construct"), [
      target("generic-web", "web", webApp),
    ]);
    const resolved = resolveReleaseDefaults(
      config(),
      registry([genericWeb, constructWeb, electron], [webDestination]),
      context,
      [
        entry("web", genericWeb.id, "generic-web"),
        entry("web", constructWeb.id, "web", { source: "construct" }),
      ],
    );

    expect(resolved.builds.map((build) => build.engine)).toEqual([constructWeb.id]);
  });

  it("ignores a source-specific entry for a source of another technology", () => {
    const resolved = resolveReleaseDefaults(
      config(),
      registry([constructWeb, electron], [webDestination]),
      context,
      [entry("web", constructWeb.id, "web", { source: "godot" })],
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("merges targetConfig into the enabled target of the created build", () => {
    const presetWeb = engine("preset-web", project("construct"), [
      target("web", "web", webApp, { createDefaultConfig: () => ({ preset: "" }) }),
    ]);
    const resolved = resolveReleaseDefaults(
      config(),
      registry([presetWeb], [webDestination]),
      context,
      [entry("web", presetWeb.id, "web", { source: "construct", targetConfig: { preset: "Web" } })],
    );

    expect(resolved.builds[0].targets).toEqual([{ id: "web", config: { preset: "Web" } }]);
  });

  it("adds nothing when the table entry's target is unavailable", () => {
    const unavailableElectron = engine(electron.id, webApp, [
      target("windows-x64", "desktop", windowsApp, {
        isAvailable: () => ({ available: false, reason: "Not installed" }),
      }),
    ]);
    const resolved = resolveReleaseDefaults(
      config(),
      registry([constructWeb, unavailableElectron]),
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("adds nothing for a desktop slot when the web entry's target is unavailable", () => {
    const unavailableWeb = engine("construct-web", project("construct"), [
      target("web", "web", webApp, {
        isAvailable: () => ({ available: false, reason: "Not installed" }),
      }),
    ]);
    const resolved = resolveReleaseDefaults(
      config(),
      registry([unavailableWeb, electron]),
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("terminates on a cycle of wrapper producers without a source-accepting end", () => {
    const first = engine("cycle-first", { kind: "application", technology: "b" }, [
      target("first-windows", "desktop", windowsApp),
    ]);
    const second = engine("cycle-second", windowsApp, [
      target("second-b", "web", { kind: "application", technology: "b", container: "directory" }),
    ]);
    const resolved = resolveReleaseDefaults(config(), registry([first, second]), context, [
      entry("desktop", first.id, "first-windows"),
      entry("web", second.id, "second-b"),
    ]);

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });

  it("stops building wrapper chains beyond the depth limit", () => {
    const linkChain = (count: number) => {
      const producers = Array.from({ length: count }, (_, index) => {
        const last = index === count - 1;
        return engine(`link-${index}`, project(`t${index}`), [
          target(
            `link-${index}-out`,
            last ? "desktop" : `step-${index}`,
            last ? windowsApp : project(`t${index + 1}`),
          ),
        ]);
      });
      const table = Array.from({ length: count }, (_, index) =>
        entry(
          index === count - 1 ? "desktop" : `step-${index}`,
          `link-${index}`,
          `link-${index}-out`,
        ),
      ).reverse();
      return { producers, table };
    };
    const chainSource = source("chain-source", project("t0"));

    const fitsChain = linkChain(4);
    const fits = resolveReleaseDefaults(
      config(chainSource.id),
      registry(fitsChain.producers, [desktopDestination], [chainSource]),
      context,
      fitsChain.table,
    );
    expect(fits.builds).toHaveLength(4);

    const tooLongChain = linkChain(5);
    const tooLong = resolveReleaseDefaults(
      config(chainSource.id),
      registry(tooLongChain.producers, [desktopDestination], [chainSource]),
      context,
      tooLongChain.table,
    );
    expect(tooLong.builds).toHaveLength(0);
    expect(slotInput(tooLong)).toBeUndefined();
  });

  it("adds a default build purely from a table entry", () => {
    const installer = engine("fake-installer", project("construct"), [
      target("installer-windows", "installer", windowsApp),
    ]);
    const installerDestination = destination({ kind: "application", platform: "windows" });
    const registryValue = registry([installer], [installerDestination]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, [
      entry("installer", installer.id, "installer-windows"),
    ]);

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0]).toMatchObject({
      engine: installer.id,
      type: "installer",
      input: { source: true },
    });
    expect(slotInput(resolved)).toEqual({
      buildId: resolved.builds[0].id,
      targetId: "installer-windows",
    });
  });

  it("builds the entry's target, not the first target of its build type", () => {
    const linuxElectron = engine(electron.id, webApp, [
      target("windows-x64", "desktop", windowsApp),
      target("linux-x64", "desktop", linuxApp),
    ]);
    const registryValue = registry([constructWeb, linuxElectron]);
    const resolved = resolveReleaseDefaults(config(), registryValue, context, [
      entry("desktop", linuxElectron.id, "linux-x64"),
      entry("web", constructWeb.id, "web", { source: "construct" }),
    ]);

    expect(resolved.builds.find((item) => item.type === "desktop")).toMatchObject({
      engine: linuxElectron.id,
      targets: [
        { id: "windows-x64", config: {} },
        { id: "linux-x64", config: {} },
      ],
    });
    expect(slotInput(resolved)).toMatchObject({ targetId: "linux-x64" });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("fills an enabled empty slot that comes after a disabled slot of the same destination", () => {
    const withDisabled: ReleaseConfig = {
      ...config(),
      destinations: [
        {
          ...config().destinations[0],
          slots: [
            { id: "off", enabled: false, config: {} },
            { id: "slot", enabled: true, config: {} },
          ],
        },
      ],
    };
    const registryValue = registry([constructWeb, electron]);
    const resolved = resolveReleaseDefaults(withDisabled, registryValue, context, DEFAULTS);

    expect(resolved.destinations[0].slots[1].input).toEqual({
      buildId: resolved.builds[1].id,
      targetId: "windows-x64",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("fills an enabled empty destination that comes after a disabled destination", () => {
    const disabledFirst: ReleaseConfig = {
      ...config(),
      destinations: [
        { ...config().destinations[0], id: "off", enabled: false },
        { ...config().destinations[0], id: "on" },
      ],
    };
    const registryValue = registry([constructWeb, electron]);
    const resolved = resolveReleaseDefaults(disabledFirst, registryValue, context, DEFAULTS);

    expect(resolved.destinations[1].slots[0].input).toEqual({
      buildId: resolved.builds[1].id,
      targetId: "windows-x64",
    });
    expect(errorsOf(resolved, registryValue)).toEqual([]);
  });

  it("is idempotent after resolving defaults", () => {
    const registryValue = registry([constructWeb, electron]);
    const once = resolveReleaseDefaults(config(), registryValue, context, DEFAULTS);

    expect(resolveReleaseDefaults(once, registryValue, context, DEFAULTS)).toEqual(once);
  });

  it("does not create a build when dynamic acceptance rejects the candidate", () => {
    const rejecting = destination(
      { kind: "application", platform: ["windows", "linux", "macos"], container: "directory" },
      { acceptsWhen: () => ({ accepted: false as const, reason: "not available" }) },
    );
    const resolved = resolveReleaseDefaults(
      config(),
      registry([constructWeb, electron], [rejecting]),
      context,
      DEFAULTS,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(slotInput(resolved)).toBeUndefined();
  });
});
