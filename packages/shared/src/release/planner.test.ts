import { describe, expect, it } from "vitest";
import { planRelease } from "./planner";
import type { ReleaseBuildProfileConfig, ReleaseConfig, ReleaseRegistry } from "./types";

const project = { kind: "project" as const, technology: "engine", container: "directory" as const };
const web = { kind: "application" as const, platform: "web", container: "directory" as const };
const registry: ReleaseRegistry = {
  sources: [{ id: "source", label: "Source", output: project, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: project } }) }],
  producers: [
    { id: "engine-a", label: "Engine A", planning: { mode: "build" }, accepts: { kind: "project", technology: "engine" }, targets: [{ id: "web", label: "Web", buildType: "web", output: web, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
    { id: "engine-b", label: "Engine B", planning: { mode: "build" }, accepts: { kind: "project", technology: "engine" }, targets: [{ id: "web", label: "Web", buildType: "web", output: web, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
    { id: "extract", label: "Extract", planning: { mode: "automatic" }, accepts: { container: "archive", format: "zip" }, targets: [{ id: "directory", label: "Directory", transform: { changes: { container: "directory" }, remove: ["format"] }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
  ],
  destinations: [{ id: "deploy", label: "Deploy", accepts: { kind: "application" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => [] }],
};

const config = (builds: ReleaseConfig["builds"]): ReleaseConfig => ({ version: "3.0.0", id: "release", project: "project", name: "Release", source: { provider: "source", config: {} }, builds, destinations: [] });

describe("release planner", () => {
  it("keeps multiple profiles using the same engine separate", () => {
    const plan = planRelease(config([{ id: "a", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }, { id: "b", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.id)).toEqual(["a", "b"]);
  });

  it("does not insert a transform when the engine accepts the source directly", () => {
    const plan = planRelease(config([{ id: "a", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.provider)).toEqual(["engine-a"]);
  });

  it("resolves implicit inputs from profiles declared later", () => {
    const ordered: ReleaseRegistry = { ...registry, producers: [...registry.producers, { ...registry.producers[1], id: "downstream", accepts: { kind: "application", platform: "web", container: "directory" } }] };
    const plan = planRelease(config([{ id: "downstream", type: "web", engine: "downstream", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }, { id: "upstream", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), ordered, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.id)).toEqual(["upstream", "downstream"]);
    expect(plan.producers[1].input).toEqual({ producerId: "upstream", outputId: "web" });
  });

  it("rejects a target belonging to another build type", () => {
    const plan = planRelease(config([{ id: "a", type: "desktop", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues.map((issue) => issue.code)).toContain("release.build.target.type");
  });

  it("inserts declared automatic transforms", () => {
    const zip: ReleaseRegistry = { ...registry, sources: [{ ...registry.sources[0], output: { kind: "application" as const, platform: "web", container: "archive" as const, format: "zip" } }], producers: [{ ...registry.producers[2] }, { ...registry.producers[0], accepts: { kind: "application", platform: "web", container: "directory" as const } }] };
    const plan = planRelease(config([{ id: "desktop", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), zip, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.issues.map((issue) => issue.code)).not.toContain("release.build.input.ambiguous");
    expect(plan.producers.map((producer) => producer.provider)).toEqual(["extract", "engine-a"]);
    const genericZip: ReleaseRegistry = { ...zip, sources: [{ ...zip.sources[0], output: { kind: "files" as const, container: "archive" as const, format: "zip" } }] };
    expect(planRelease(config([{ id: "desktop", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), genericZip, { host: { platform: "linux", architecture: "x64" } }).issues.map((issue) => issue.code)).toContain("release.build.input.missing");
  });

  it("preserves the complete descriptor through passthrough transforms", () => {
    const passthrough: ReleaseRegistry = {
      ...registry,
      producers: [{
        id: "passthrough",
        label: "Passthrough",
        planning: { mode: "automatic" },
        accepts: {},
        targets: [{ id: "output", label: "Output", transform: { changes: {} }, createDefaultConfig: () => ({}) }],
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: () => ({ steps: [], artifacts: {} }),
      }, { ...registry.producers[0], accepts: { kind: "application", platform: "web", container: "directory" } }],
      sources: [{ ...registry.sources[0], output: { kind: "application" as const, platform: "web", container: "directory" as const } }],
    };
    const plan = planRelease(config([{ id: "desktop", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), passthrough, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.outputs[0].descriptor).toEqual({ kind: "application", platform: "web", container: "directory" });
  });

  it("reports dynamic acceptance reasons", () => {
    const dynamic = { ...registry, destinations: [{ ...registry.destinations[0], accepts: { kind: "project" }, acceptsWhen: () => ({ accepted: false as const, reason: "Deployment is locked." }) }] };
    const plan = planRelease({ ...config([]), destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }] }] }, dynamic, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues.some((issue) => issue.message === "Deployment is locked.")).toBe(true);
  });

  it("reports dynamic producer rejection reasons", () => {
    const dynamic: ReleaseRegistry = { ...registry, producers: [{ ...registry.producers[0], id: "locked", acceptsWhen: () => ({ accepted: false as const, reason: "Build is locked." }) }] };
    const plan = planRelease(config([{ id: "locked", type: "web", engine: "locked", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), dynamic, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues.some((issue) => issue.message === "Build is locked.")).toBe(true);
  });

  it("reports an unknown build engine", () => {
    const plan = planRelease(config([{ id: "missing", type: "web", engine: "missing", enabled: true, config: {}, targets: [] }]), registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues.map((issue) => issue.code)).toContain("release.build.engine.unknown");
  });

  it("reports cycles and ambiguous inputs", () => {
    const cycleRegistry: ReleaseRegistry = { ...registry, producers: [{ ...registry.producers[0], id: "cycle", accepts: {}, targets: [{ id: "out", label: "Output", output: web, createDefaultConfig: () => ({}) }] }] };
    const cycle = planRelease(config([{ id: "a", type: "web", engine: "cycle", enabled: true, input: { buildId: "b", targetId: "out" }, config: {}, targets: [{ id: "out", enabled: true, config: {} }] }, { id: "b", type: "web", engine: "cycle", enabled: true, input: { buildId: "a", targetId: "out" }, config: {}, targets: [{ id: "out", enabled: true, config: {} }] }]), cycleRegistry, { host: { platform: "linux", architecture: "x64" } });
    expect(cycle.issues.map((issue) => issue.code)).toContain("release.build.input.cycle");

    const mergeRegistry: ReleaseRegistry = { ...registry, producers: [...registry.producers, { ...registry.producers[0], id: "merge", accepts: { kind: "application", platform: "web", container: "directory" }, targets: [{ id: "out", label: "Output", output: web, createDefaultConfig: () => ({}) }] }] };
    const ambiguous = planRelease(config([{ id: "a", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }, { id: "b", type: "web", engine: "engine-b", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }, { id: "merge", type: "web", engine: "merge", enabled: true, config: {}, targets: [{ id: "out", enabled: true, config: {} }] }]), mergeRegistry, { host: { platform: "linux", architecture: "x64" } });
    expect(ambiguous.issues.map((issue) => issue.code)).toContain("release.build.input.ambiguous");
  });

  it("rejects destination references to missing and disabled targets", () => {
    const base = config([{ id: "build", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]);
    const missingTarget = planRelease({ ...base, destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "slot", enabled: true, input: { buildId: "build", targetId: "missing" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(missingTarget.issues).toContainEqual(expect.objectContaining({ code: "release.destination.input.invalid", path: "destinations.0.slots.0.input" }));

    const disabledTarget = planRelease({ ...base, builds: [{ ...base.builds[0], targets: [{ id: "web", enabled: false, config: {} }] }], destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "slot", enabled: true, input: { buildId: "build", targetId: "web" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(disabledTarget.issues).toContainEqual(expect.objectContaining({ code: "release.destination.input.invalid", path: "destinations.0.slots.0.input" }));

    const missingBuild = planRelease({ ...config([]), destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "slot", enabled: true, input: { buildId: "missing", targetId: "web" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(missingBuild.issues).toContainEqual(expect.objectContaining({ code: "release.build.reference.disabled", path: "destinations.0.slots.0.input" }));

    const disabledBuild = planRelease({ ...base, builds: [{ ...base.builds[0], enabled: false }], destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "slot", enabled: true, input: { buildId: "build", targetId: "web" }, config: {} }] }] }, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(disabledBuild.issues).toContainEqual(expect.objectContaining({ code: "release.build.reference.disabled", path: "destinations.0.slots.0.input" }));
  });

  it("keeps automatic outputs internal and includes source in public outputs", () => {
    const zip: ReleaseRegistry = { ...registry, sources: [{ ...registry.sources[0], output: { kind: "application" as const, platform: "web", container: "archive" as const, format: "zip" } }], producers: [{ ...registry.producers[2] }, { ...registry.producers[0], accepts: { kind: "application", platform: "web", container: "directory" as const } }] };
    const plan = planRelease(config([{ id: "desktop", type: "web", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), zip, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toEqual([]);
    expect(plan.outputs.map((output) => output.ref)).toEqual([{ source: true }, { buildId: "desktop", targetId: "web" }]);
    expect(plan.outputs.every((output) => !("buildId" in output.ref) || !output.ref.buildId.startsWith("__auto__"))).toBe(true);
  });

  it("does not crash when planning malformed configuration", () => {
    const plan = planRelease({} as ReleaseConfig, registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues.some((issue) => issue.code === "release.config.version")).toBe(true);
    expect(plan.producers).toEqual([]);
    expect(plan.destinations).toEqual([]);
  });

  it("uses array indexes in build validation paths", () => {
    const plan = planRelease(config([{ id: "desktop", type: "desktop", engine: "engine-a", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }]), registry, { host: { platform: "linux", architecture: "x64" } });
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: "release.build.target.type", path: "builds.0.targets" }));
  });

  it("resolves implicit inputs independently of Build Profile order", () => {
    const webSource = { kind: "application" as const, platform: "web", container: "directory" as const };
    const webRegistry: ReleaseRegistry = {
      sources: [{ ...registry.sources[0], output: webSource }],
      producers: [
        { ...registry.producers[0], id: "engine-a", accepts: webSource, targets: [{ id: "web", label: "Web", buildType: "web", output: webSource, createDefaultConfig: () => ({}) }] },
        { ...registry.producers[0], id: "engine-b", accepts: webSource, targets: [{ id: "web", label: "Web", buildType: "web", output: webSource, createDefaultConfig: () => ({}) }] },
      ],
      destinations: [],
    };
    const buildA: ReleaseBuildProfileConfig = { id: "a", type: "web", engine: "engine-a", enabled: true, input: { source: true }, config: {}, targets: [{ id: "web", enabled: true, config: {} }] };
    const buildB: ReleaseBuildProfileConfig = { id: "b", type: "web", engine: "engine-b", enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] };
    const ordered = (builds: ReleaseBuildProfileConfig[]) => planRelease(config(builds), webRegistry, { host: { platform: "linux", architecture: "x64" } });

    for (const plan of [ordered([buildA, buildB]), ordered([buildB, buildA])]) {
      expect(plan.issues.map((issue) => issue.code)).toContain("release.build.input.ambiguous");
    }

    for (const input of [{ buildId: "a", targetId: "web" }, { source: true }] as const) {
      for (const builds of [[{ ...buildA, input: { source: true as const } }, { ...buildB, input }], [{ ...buildB, input }, { ...buildA, input: { source: true as const } }]]) {
        expect(ordered(builds).issues).toEqual([]);
      }
    }
  });
});
