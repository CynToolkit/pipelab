import { describe, expect, it } from "vitest";
import { DEFAULT_RELEASE_BUILD_PREFERENCES, resolveReleaseDefaults } from "./preferences";
import type {
  ReleaseConfig,
  ReleaseDestinationDefinition,
  ReleaseProducerDefinition,
  ReleaseRegistry,
  ReleaseSourceDefinition,
} from "./types";

const project = { kind: "project", container: "directory" } as const;
const application = { kind: "application", platform: "windows", container: "directory" } as const;

const source: ReleaseSourceDefinition = {
  id: "fake-source",
  label: "Fake source",
  output: project,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifact: null as never }),
};

const build: ReleaseProducerDefinition = {
  id: "fake-engine",
  label: "Fake engine",
  accepts: { kind: "project" },
  planning: { mode: "build" },
  targets: [
    {
      id: "windows",
      label: "Windows",
      buildType: "desktop",
      output: application,
      createDefaultConfig: () => ({}),
    },
    {
      id: "linux",
      label: "Linux",
      buildType: "desktop",
      output: { ...application, platform: "linux" },
      createDefaultConfig: () => ({}),
    },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifacts: {} }),
};

const destination = (
  accepts: ReleaseDestinationDefinition["accepts"],
): ReleaseDestinationDefinition => ({
  id: "fake-destination",
  label: "Fake destination",
  accepts,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => [],
});

const registry = (
  destinationDefinition = destination({ kind: "application" }),
): ReleaseRegistry => ({
  sources: [source],
  producers: [build],
  destinations: [destinationDefinition],
});

const config = (withBuilds: ReleaseConfig["builds"] = []): ReleaseConfig => ({
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: source.id, config: {} },
  builds: withBuilds,
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

describe("resolveReleaseDefaults", () => {
  it("uses the configured desktop default of Electron and Windows x64", () => {
    expect(DEFAULT_RELEASE_BUILD_PREFERENCES.buildTypes.desktop).toEqual({
      engine: "@pipelab/plugin-electron/producer",
      targets: ["windows-x64"],
    });

    const electron = {
      ...build,
      id: "@pipelab/plugin-electron/producer",
      targets: [{ ...build.targets[0], id: "windows-x64" }],
    };
    const resolved = resolveReleaseDefaults(
      config(),
      {
        ...registry(),
        producers: [electron],
      },
      context,
    );

    expect(resolved.builds[0]).toMatchObject({
      engine: "@pipelab/plugin-electron/producer",
      targets: [{ id: "windows-x64", enabled: true }],
    });
    expect(resolved.destinations[0].slots[0].input).toEqual({
      buildId: resolved.builds[0].id,
      targetId: "windows-x64",
    });
  });

  it("routes a source output through the planner without creating a build when accepted", () => {
    const resolved = resolveReleaseDefaults(
      config(),
      registry(destination({ kind: "project" })),
      context,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(resolved.destinations[0].slots[0].input).toEqual({ source: true });
  });

  it("creates one opaque build profile when the planner requires a build", () => {
    const resolved = resolveReleaseDefaults(config(), registry(), context, {
      buildTypes: { desktop: { engine: build.id, targets: ["windows"] } },
    });

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0].id).not.toMatch(/^release-build-/);
    expect(resolved.builds[0].targets).toEqual([
      { id: "windows", enabled: true, config: {} },
      { id: "linux", enabled: false, config: {} },
    ]);
    expect(resolved.destinations[0].slots[0].input).toEqual({
      buildId: resolved.builds[0].id,
      targetId: "windows",
    });
  });

  it("reuses an existing planner output instead of creating a duplicate build", () => {
    const existing = {
      id: "manual-build",
      type: "desktop",
      engine: build.id,
      enabled: true,
      config: {},
      targets: [{ id: "windows", enabled: true, config: {} }],
    };
    const resolved = resolveReleaseDefaults(config([existing]), registry(), context);

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.destinations[0].slots[0].input).toEqual({
      buildId: "manual-build",
      targetId: "windows",
    });
  });

  it("preserves an explicit destination output", () => {
    const explicit = config();
    explicit.destinations[0].slots[0].input = { source: true };

    const resolved = resolveReleaseDefaults(explicit, registry(), context);

    expect(resolved.destinations[0].slots[0].input).toEqual({ source: true });
    expect(resolved.builds).toHaveLength(0);
  });

  it("reuses one compatible build output for multiple destinations", () => {
    const multiDestination = config();
    multiDestination.destinations.push({
      ...structuredClone(multiDestination.destinations[0]),
      id: "second-destination",
      slots: [{ id: "second-slot", enabled: true, config: {} }],
    });

    const resolved = resolveReleaseDefaults(multiDestination, registry(), context, {
      buildTypes: { desktop: { engine: build.id, targets: ["windows"] } },
    });

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.destinations.map((item) => item.slots[0].input)).toEqual([
      { buildId: resolved.builds[0].id, targetId: "windows" },
      { buildId: resolved.builds[0].id, targetId: "windows" },
    ]);
  });

  it("does not force an unavailable preferred target", () => {
    const unavailableBuild = {
      ...build,
      targets: [
        {
          ...build.targets[0],
          isAvailable: () => ({ available: false, reason: "Not installed" }),
        },
      ],
    };

    const resolved = resolveReleaseDefaults(
      config(),
      { ...registry(), producers: [unavailableBuild] },
      context,
      { buildTypes: { desktop: { engine: build.id, targets: ["windows"] } } },
    );

    expect(resolved.builds).toHaveLength(0);
    expect(resolved.destinations[0].slots[0].input).toBeUndefined();
  });

  it("is idempotent after resolving defaults", () => {
    const once = resolveReleaseDefaults(config(), registry(), context, {
      buildTypes: { desktop: { engine: build.id, targets: ["windows"] } },
    });

    expect(resolveReleaseDefaults(once, registry(), context)).toEqual(once);
  });

  it("does not create a build when dynamic acceptance rejects the candidate", () => {
    const rejectingDestination = {
      ...destination({ kind: "application" }),
      acceptsWhen: () => ({ accepted: false as const, reason: "not available" }),
    };
    const resolved = resolveReleaseDefaults(config(), registry(rejectingDestination), context);

    expect(resolved.builds).toHaveLength(0);
    expect(resolved.destinations[0].slots[0].input).toBeUndefined();
  });

  it("tries the central default after an unavailable preferred engine", () => {
    const centralFallback = {
      ...build,
      id: "@pipelab/plugin-electron/producer",
      targets: [{ ...build.targets[0], id: "windows-x64" }],
    };
    const resolved = resolveReleaseDefaults(
      config(),
      { ...registry(), producers: [centralFallback] },
      context,
      { buildTypes: { desktop: { engine: "missing-engine", targets: ["windows"] } } },
    );

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0].engine).toBe("@pipelab/plugin-electron/producer");
    expect(resolved.destinations[0].slots[0].input).toMatchObject({ targetId: "windows-x64" });
  });

  it("tries the central default when the preferred engine is incompatible", () => {
    const incompatible = {
      ...build,
      id: "preferred-incompatible",
      accepts: { kind: "project", technology: "other-engine" },
      targets: [{ ...build.targets[0], id: "preferred-windows" }],
    };
    const centralFallback = {
      ...build,
      id: "@pipelab/plugin-electron/producer",
      targets: [{ ...build.targets[0], id: "windows-x64" }],
    };
    const resolved = resolveReleaseDefaults(
      config(),
      { ...registry(), producers: [incompatible, centralFallback] },
      context,
      { buildTypes: { desktop: { engine: incompatible.id, targets: ["preferred-windows"] } } },
    );

    expect(resolved.builds).toHaveLength(1);
    expect(resolved.builds[0].engine).toBe(centralFallback.id);
    expect(resolved.destinations[0].slots[0].input).toMatchObject({ targetId: "windows-x64" });
  });
});
