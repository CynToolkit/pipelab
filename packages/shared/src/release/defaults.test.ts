import { describe, expect, it } from "vitest";
import { validateReleaseDefaults, type ReleaseDefaultEntry } from "./defaults";
import type {
  ReleaseProducerDefinition,
  ReleaseProducerTargetDefinition,
  ReleaseRegistry,
} from "./types";

const webApp = { kind: "application", platform: "web", container: "directory" } as const;

const target = (
  id: string,
  buildType: string,
  extra: Partial<ReleaseProducerTargetDefinition> = {},
): ReleaseProducerTargetDefinition => ({
  id,
  label: id,
  buildType,
  output: webApp,
  createDefaultConfig: () => ({}),
  ...extra,
});

const producer = (
  id: string,
  targets: ReleaseProducerTargetDefinition[],
): ReleaseProducerDefinition => ({
  id,
  label: id,
  accepts: { kind: "project" },
  planning: { mode: "build" },
  targets,
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifacts: {} }),
});

const registry = (producers: ReleaseProducerDefinition[]): ReleaseRegistry => ({
  sources: [],
  producers,
  destinations: [],
});

const entry = (
  buildType: string,
  engine: string,
  targetId: string,
  extra: Partial<ReleaseDefaultEntry> = {},
): ReleaseDefaultEntry => ({ buildType, engine, target: targetId, ...extra });

const fake = registry([
  producer("engine-a", [
    target("web", "web"),
    target("desktop-x64", "desktop"),
    target("preset-web", "web", {
      createDefaultConfig: () => ({ preset: "" }),
    }),
    target("field-web", "web", {
      fields: [{ key: "preset", type: "select", label: "Preset" }],
    }),
  ]),
]);

const desktopOutput = (platform: string, architecture: string) =>
  ({
    kind: "application",
    technology: "engine",
    platform,
    architecture,
    container: "directory",
  }) as const;

const desktopRegistry = registry([
  producer("engine-desktop", [
    target("windows-x64", "desktop", {
      output: desktopOutput("windows", "x64"),
      createDefaultConfig: () => ({ preset: "" }),
    }),
    target("linux-x64", "desktop", { output: desktopOutput("linux", "x64") }),
  ]),
]);

describe("validateReleaseDefaults", () => {
  it("reports no problem for an entry that names a target of its build type", () => {
    expect(validateReleaseDefaults([entry("web", "engine-a", "web")], fake)).toEqual([]);
  });

  it("reports no problem for an empty table", () => {
    expect(validateReleaseDefaults([], fake)).toEqual([]);
  });

  it("reports an engine that is not in the registry", () => {
    const problems = validateReleaseDefaults([entry("web", "engine-missing", "web")], fake);
    expect(problems).toEqual([expect.stringContaining("engine-missing")]);
  });

  it("reports a target that the engine does not declare", () => {
    const problems = validateReleaseDefaults([entry("web", "engine-a", "no-such-target")], fake);
    expect(problems).toEqual([expect.stringContaining("no-such-target")]);
  });

  it("reports an entry whose build type differs from the target's build type", () => {
    const problems = validateReleaseDefaults([entry("web", "engine-a", "desktop-x64")], fake);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("desktop-x64");
  });

  it("reports a targetConfig key that neither the target fields nor its default config declare", () => {
    const problems = validateReleaseDefaults(
      [entry("web", "engine-a", "web", { targetConfig: { preset: "Web" } })],
      fake,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("preset");
  });

  it("accepts a targetConfig key declared by the target's default config", () => {
    expect(
      validateReleaseDefaults(
        [entry("web", "engine-a", "preset-web", { targetConfig: { preset: "Web" } })],
        fake,
      ),
    ).toEqual([]);
  });

  it("accepts a targetConfig key declared by a target field", () => {
    expect(
      validateReleaseDefaults(
        [entry("web", "engine-a", "field-web", { targetConfig: { preset: "Web" } })],
        fake,
      ),
    ).toEqual([]);
  });

  it("reports two entries with the same build type and no source", () => {
    const problems = validateReleaseDefaults(
      [entry("web", "engine-a", "web"), entry("web", "engine-a", "preset-web")],
      fake,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("web");
  });

  it("reports two entries with the same build type and the same source", () => {
    const problems = validateReleaseDefaults(
      [
        entry("web", "engine-a", "web", { source: "construct" }),
        entry("web", "engine-a", "preset-web", { source: "construct" }),
      ],
      fake,
    );
    expect(problems).toHaveLength(1);
  });

  it("allows one generic entry and source-specific entries for the same build type", () => {
    expect(
      validateReleaseDefaults(
        [
          entry("web", "engine-a", "web"),
          entry("web", "engine-a", "preset-web", { source: "construct" }),
          entry("web", "engine-a", "field-web", { source: "godot" }),
        ],
        fake,
      ),
    ).toEqual([]);
  });

  it("reports every problem of the table in table order", () => {
    const problems = validateReleaseDefaults(
      [entry("web", "engine-missing", "web"), entry("desktop", "engine-a", "web")],
      fake,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("engine-missing");
    expect(problems[1]).toContain("web");
  });

  it("accepts a host entry, which resolves per host and so names no target itself", () => {
    expect(
      validateReleaseDefaults([entry("desktop", "engine-desktop", "host")], desktopRegistry),
    ).toEqual([]);
  });

  it("reports a host entry targetConfig key that a desktop target it can resolve to does not declare", () => {
    const problems = validateReleaseDefaults(
      [entry("desktop", "engine-desktop", "host", { targetConfig: { preset: "Desktop" } })],
      desktopRegistry,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("linux-x64");
  });

  it("reports a targetConfigs key that the engine does not have as a target", () => {
    const problems = validateReleaseDefaults(
      [entry("web", "engine-a", "web", { targetConfigs: { "no-such-target": {} } })],
      fake,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no-such-target");
  });

  it("reports a targetConfigs config key that its target does not declare", () => {
    const problems = validateReleaseDefaults(
      [entry("web", "engine-a", "web", { targetConfigs: { "preset-web": { unknown: 1 } } })],
      fake,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("unknown");
  });

  it("accepts targetConfigs keyed by host-resolvable targets that declare their keys", () => {
    expect(
      validateReleaseDefaults(
        [
          entry("desktop", "engine-desktop", "host", {
            targetConfigs: { "windows-x64": { preset: "Windows" }, "linux-x64": {} },
          }),
        ],
        desktopRegistry,
      ),
    ).toEqual([]);
  });
});
