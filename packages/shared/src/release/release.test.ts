import { describe, expect, it } from "vitest";
import { buildReleaseCatalog, buildReleaseRegistry, descriptorsEqual, matchesArtifact, resolveTargetDescriptor, transformArtifactDescriptor, validateRelease, validateReleaseConfigShape, type MainPluginDefinition, type ReleaseRegistry } from "../index";

const fakePlugin = (id: string): MainPluginDefinition => ({
  id,
  packageName: id,
  name: id,
  description: id,
  icon: { type: "icon", icon: "pi-box" },
  isOfficial: false,
  nodes: [],
  release: {
    sources: [{
      id: `${id}/source`,
      label: "Fake source",
      output: { kind: "project", technology: "fake", container: "directory" },
      createDefaultConfig: () => ({ path: "" }),
      validate: () => [],
      compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake", container: "directory" } } }),
    }],
    producers: [],
    destinations: [],
  },
});

describe("release descriptors", () => {
  it("matches descriptor fields and capabilities without producer IDs", () => {
    expect(matchesArtifact({ kind: "application", platform: "windows", container: "directory" }, { kind: "application", platform: ["windows", "linux"], container: "directory" })).toBe(true);
    expect(matchesArtifact({ kind: "application", platform: "web", container: "directory" }, { kind: "application", platform: "windows", container: "directory" })).toBe(false);
    expect(matchesArtifact({ kind: "application", container: "directory", capabilities: ["copy"] }, { capabilities: ["copy"] })).toBe(true);
  });

  it("does not infer semantic meaning from filesystem shape", () => {
    const genericFolder = { kind: "files" as const, container: "directory" as const };
    const webFolder = { kind: "application" as const, platform: "web", container: "directory" as const };
    expect(matchesArtifact(genericFolder, { kind: "application", platform: "web", container: "directory" })).toBe(false);
    expect(matchesArtifact(webFolder, { kind: "application", platform: "web", container: "directory" })).toBe(true);
    expect(matchesArtifact({ kind: "files", container: "archive", format: "zip" }, { kind: "application", platform: "web" })).toBe(false);
    expect(transformArtifactDescriptor({ kind: "application", platform: "web", container: "archive", format: "zip" }, { container: "directory", format: undefined })).toEqual({ kind: "application", platform: "web", container: "directory", format: undefined });
  });

  it("builds a catalog from a newly registered plugin", () => {
    const catalog = buildReleaseCatalog(buildReleaseRegistry([fakePlugin("@example/fake-engine")]));
    expect(catalog.sources.map((source) => source.id)).toEqual(["@example/fake-engine/source"]);
    expect(catalog.sources[0]).not.toHaveProperty("compile");
  });

  it("accepts only the V3 release shape", () => {
    expect(validateReleaseConfigShape({ version: "2.0.0" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "release.config.version" }),
    ]));
    expect(validateReleaseConfigShape({ version: "3.0.0", id: "r", project: "p", name: "n", source: { provider: "fake", config: {} }, producers: [], destinations: [] })).toEqual([]);
  });

  it("compares descriptors structurally regardless of property order", () => {
    expect(descriptorsEqual({ kind: "application", platform: "web", container: "directory" }, { container: "directory", kind: "application", platform: "web" })).toBe(true);
    expect(descriptorsEqual({ kind: "application", platform: "web", container: "directory" }, { kind: "application", platform: "windows", container: "directory" })).toBe(false);
  });

  it("resolves transformed target descriptors from the input descriptor", () => {
    expect(resolveTargetDescriptor({ kind: "application", platform: "web", container: "archive", format: "zip" }, { transform: { changes: { container: "directory" }, remove: ["format"] } })).toEqual({ kind: "application", platform: "web", container: "directory" });
  });

  it("validates transformed producer chains before compilation", () => {
    const sourceDescriptor = { kind: "application" as const, platform: "web", container: "archive" as const, format: "zip" };
    const transformedRegistry: ReleaseRegistry = {
      sources: [{ id: "source", label: "ZIP", output: sourceDescriptor, createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: sourceDescriptor } }) }],
      producers: [
        { id: "extract", label: "Extract", accepts: { container: "archive", format: "zip" }, targets: [{ id: "output", label: "Directory", transform: { changes: { container: "directory" }, remove: ["format"] }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
        { id: "electron", label: "Electron", accepts: { kind: "application", platform: "web", container: "directory" }, targets: [{ id: "windows", label: "Windows", output: { kind: "application", platform: "windows", container: "directory" }, createDefaultConfig: () => ({}) }], createDefaultConfig: () => ({}), validate: () => [], compile: () => ({ steps: [], artifacts: {} }) },
      ],
      destinations: [{ id: "deploy", label: "Deploy", accepts: { kind: "application", platform: "windows", container: "directory" }, createDefaultConfig: () => ({}), validate: () => [], compile: () => [] }],
    };
    const issues = validateRelease({ version: "3.0.0", id: "chain", project: "p", name: "Chain", source: { provider: "source", config: {} }, producers: [{ id: "extract", provider: "extract", enabled: true, input: { source: true }, targets: [{ id: "output", enabled: true, config: {} }], config: {} }, { id: "electron", provider: "electron", enabled: true, input: { producerId: "extract", outputId: "output" }, targets: [{ id: "windows", enabled: true, config: {} }], config: {} }], destinations: [{ id: "deploy", provider: "deploy", enabled: true, config: {}, slots: [{ id: "windows", enabled: true, input: { producerId: "electron", outputId: "windows" }, config: {} }] }] }, transformedRegistry, { host: { platform: "linux", architecture: "x64" } });
    expect(issues).toEqual([]);
  });
});
