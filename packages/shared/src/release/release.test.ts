import { describe, expect, it } from "vitest";
import { buildReleaseCatalog, buildReleaseRegistry, descriptorsEqual, matchesArtifact, resolveTargetDescriptor, transformArtifactDescriptor, validateRelease, validateReleaseConfigShape, type MainPluginDefinition, type ReleaseConfig, type ReleaseRegistry } from "../index";

const fakePlugin = (id: string): MainPluginDefinition => ({ id, packageName: id, name: id, description: id, icon: { type: "icon", icon: "pi-box" }, isOfficial: false, nodes: [], release: { sources: [{ id: `${id}/source`, label: "Fake source", output: { kind: "project", technology: "fake", container: "directory" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake", container: "directory" } } }) }] } });

describe("release descriptors", () => {
  it("matches descriptors without producer IDs", () => {
    expect(matchesArtifact({ kind: "application", platform: "windows", container: "directory" }, { kind: "application", platform: ["windows", "linux"], container: "directory" })).toBe(true);
    expect(matchesArtifact({ kind: "application", platform: "web", container: "directory" }, { kind: "application", platform: "windows", container: "directory" })).toBe(false);
    expect(matchesArtifact({ kind: "files", container: "directory" }, { kind: "application", platform: "web" })).toBe(false);
  });

  it("keeps filesystem semantics explicit", () => {
    expect(transformArtifactDescriptor({ kind: "application", platform: "web", container: "archive", format: "zip" }, { container: "directory", format: undefined })).toEqual({ kind: "application", platform: "web", container: "directory", format: undefined });
  });

  it("builds a JSON-only catalog", () => {
    const catalog = buildReleaseCatalog(buildReleaseRegistry([fakePlugin("@example/fake-engine")]));
    expect(catalog.buildTypes.map((type) => type.id)).toContain("desktop");
    expect(catalog.sources[0]).not.toHaveProperty("compile");
  });

  it("accepts only the V3 Build Profile shape", () => {
    expect(validateReleaseConfigShape({ version: "2.0.0" })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "release.config.version" })]));
    expect(validateReleaseConfigShape({ version: "3.0.0", id: "r", project: "p", name: "n", source: { provider: "fake", config: {} }, builds: [], destinations: [] })).toEqual([]);
  });

  it("compares descriptors structurally regardless of key order", () => {
    expect(descriptorsEqual({ kind: "application", platform: "web", container: "directory" }, { container: "directory", kind: "application", platform: "web" })).toBe(true);
    expect(descriptorsEqual({ kind: "application", platform: "web", container: "directory" }, { kind: "application", platform: "windows", container: "directory" })).toBe(false);
  });

  it("resolves transformed target descriptors", () => {
    expect(resolveTargetDescriptor({ kind: "application", platform: "web", container: "archive", format: "zip" }, { transform: { changes: { container: "directory" }, remove: ["format"] } })).toEqual({ kind: "application", platform: "web", container: "directory" });
  });

  it("validates transformed chains and rejects semantic mismatches", () => {
    const sourceDescriptor = { kind: "application" as const, platform: "web", container: "archive" as const, format: "zip" };
    const registry: ReleaseRegistry = {
      sources: [{ id: "source", label: "ZIP", output: sourceDescriptor, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: sourceDescriptor } }) }],
      producers: [
        { id: "extract", label: "Extract", planning: { mode: "automatic" }, accepts: { container: "archive", format: "zip" }, targets: [{ id: "output", label: "Extracted", transform: { changes: { container: "directory" }, remove: ["format"] }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
        { id: "electron", label: "Electron", planning: { mode: "build" }, accepts: { kind: "application", platform: "web", container: "directory" }, targets: [{ id: "windows", label: "Windows", output: { kind: "application", platform: "windows", container: "directory" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
      ], destinations: [] as ReleaseRegistry["destinations"],
    };
    const valid: ReleaseConfig = { version: "3.0.0", id: "chain", project: "p", name: "Chain", source: { provider: "source", config: {} }, builds: [{ id: "electron", type: "desktop", engine: "electron", enabled: true, config: {}, targets: [{ id: "windows", enabled: true, config: {} }] }], destinations: [] };
    expect(validateRelease(valid, registry, { host: { platform: "linux", architecture: "x64" } })).toEqual([]);
    const invalid = { ...valid, source: { provider: "source", config: {} }, builds: [{ ...valid.builds[0], engine: "electron" }] };
    const noTransformRegistry = { ...registry, producers: registry.producers.filter((producer) => producer.id !== "extract") };
    expect(validateRelease(invalid, noTransformRegistry, { host: { platform: "linux", architecture: "x64" } }).some((issue) => issue.code === "release.build.input.missing")).toBe(true);
  });
});
