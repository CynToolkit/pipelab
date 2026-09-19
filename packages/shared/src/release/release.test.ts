import { describe, expect, it } from "vitest";
import { buildReleaseCatalog, matchesArtifact, validateReleaseConfigShape, type MainPluginDefinition } from "../index";

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
      output: { kind: "project", technology: "fake" },
      createDefaultConfig: () => ({ path: "" }),
      validate: () => [],
      compile: () => ({ steps: [], artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: { kind: "project", technology: "fake" } } }),
    }],
    producers: [],
    destinations: [],
  },
});

describe("release descriptors", () => {
  it("matches descriptor fields and capabilities without producer IDs", () => {
    expect(matchesArtifact({ kind: "application", platform: "windows" }, { kind: "application", platform: ["windows", "linux"] })).toBe(true);
    expect(matchesArtifact({ kind: "application", platform: "web" }, { kind: "application", platform: "windows" })).toBe(false);
    expect(matchesArtifact({ kind: "application", capabilities: ["copy"] }, { capabilities: ["copy"] })).toBe(true);
  });

  it("builds a catalog from a newly registered plugin", () => {
    const catalog = buildReleaseCatalog([fakePlugin("@example/fake-engine")]);
    expect(catalog.sources.map((source) => source.id)).toEqual(["@example/fake-engine/source"]);
  });

  it("accepts only the V3 release shape", () => {
    expect(validateReleaseConfigShape({ version: "2.0.0" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "release.config.version" }),
    ]));
    expect(validateReleaseConfigShape({ version: "3.0.0", id: "r", project: "p", name: "n", source: { provider: "fake", config: {} }, producers: [], destinations: [] })).toEqual([]);
  });
});
