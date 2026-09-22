import { describe, expect, it } from "vitest";
import { resolveReleaseDefaults } from "./preferences";
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
    expect(resolved.builds[0].id).toMatch(/^release-build-/);
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
});
