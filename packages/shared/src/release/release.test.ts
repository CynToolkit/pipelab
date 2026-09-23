import { describe, expect, it } from "vitest";
import {
  buildReleaseCatalog,
  buildReleaseRegistry,
  createReleaseConfig,
  descriptorsEqual,
  matchesArtifact,
  parseReleaseConfig,
  resolveTargetDescriptor,
  transformArtifactDescriptor,
  validateRelease,
  validateReleaseConnectionReferences,
  validateReleaseConfigShape,
  type MainPluginDefinition,
  type ReleaseConfig,
  type ReleaseRegistry,
} from "../index";

const fakePlugin = (id: string): MainPluginDefinition => ({
  id,
  packageName: id,
  name: id,
  description: id,
  icon: { type: "icon", icon: "pi-box" },
  isOfficial: false,
  nodes: [],
  release: {
    sources: [
      {
        id: `${id}/source`,
        label: "Fake source",
        output: { kind: "project", technology: "fake", container: "directory" },
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: () => ({
          steps: [],
          artifact: {
            reference: { stepId: "source", artifact: "output" },
            descriptor: { kind: "project", technology: "fake", container: "directory" },
          },
        }),
      },
    ],
  },
});

describe("release descriptors", () => {
  it("matches descriptors without producer IDs", () => {
    expect(
      matchesArtifact(
        { kind: "application", platform: "windows", container: "directory" },
        { kind: "application", platform: ["windows", "linux"], container: "directory" },
      ),
    ).toBe(true);
    expect(
      matchesArtifact(
        { kind: "application", platform: "web", container: "directory" },
        { kind: "application", platform: "windows", container: "directory" },
      ),
    ).toBe(false);
    expect(
      matchesArtifact(
        { kind: "files", container: "directory" },
        { kind: "application", platform: "web" },
      ),
    ).toBe(false);
  });

  it("keeps filesystem semantics explicit", () => {
    expect(
      transformArtifactDescriptor(
        { kind: "application", platform: "web", container: "archive", format: "zip" },
        { container: "directory", format: undefined },
      ),
    ).toEqual({ kind: "application", platform: "web", container: "directory", format: undefined });
  });

  it("builds a JSON-only catalog", () => {
    const catalog = buildReleaseCatalog(buildReleaseRegistry([fakePlugin("@example/fake-engine")]));
    expect(catalog.buildTypes.map((type) => type.id)).toContain("desktop");
    expect(catalog.sources[0]).not.toHaveProperty("compile");
  });

  it("accepts only the V3 Build Profile shape", () => {
    expect(validateReleaseConfigShape({ version: "2.0.0" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "release.config.version" })]),
    );
    expect(
      validateReleaseConfigShape({
        version: "3.0.0",
        id: "r",
        project: "p",
        name: "n",
        source: { provider: "fake", config: {} },
        builds: [],
        destinations: [],
      }),
    ).toEqual([]);
  });

  it("rejects duplicate owned IDs and malformed references", () => {
    const config = createReleaseConfig({
      id: "r",
      project: "p",
      name: "n",
      source: { provider: "source", config: {} },
    });
    const invalid = {
      ...config,
      source: { provider: "source", config: {} },
      builds: [
        {
          id: "same",
          type: "desktop",
          engine: "electron",
          enabled: true,
          config: {},
          targets: [{ id: "same", enabled: true, config: {} }],
        },
        {
          id: "same",
          type: "desktop",
          engine: "electron",
          enabled: true,
          config: {},
          targets: [{ id: "other", enabled: true, config: {} }],
        },
      ],
      destinations: [
        {
          id: "same",
          provider: "dest",
          enabled: true,
          config: {},
          slots: [
            {
              id: "slot",
              enabled: true,
              input: { buildId: "missing", targetId: "target" },
              config: {},
            },
          ],
        },
      ],
    };
    const issues = validateReleaseConfigShape(invalid);
    expect(issues.some((issue) => issue.code === "release.config.duplicate-id")).toBe(true);
    expect(issues.some((issue) => issue.code === "release.destination.slot.invalid")).toBe(false);
    expect(() => parseReleaseConfig(invalid)).toThrow("already used");
  });

  it("validates release output references exactly", () => {
    const base = createReleaseConfig({
      id: "workflow",
      project: "project",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    const build = {
      id: "build",
      type: "desktop",
      engine: "engine",
      enabled: true,
      config: {},
      targets: [{ id: "target", enabled: true, config: {} }],
    };
    const destination = {
      id: "destination",
      provider: "destination",
      enabled: true,
      config: {},
      slots: [{ id: "slot", enabled: true, config: {} }],
    };
    const withRefs = (input: unknown) => ({
      ...base,
      builds: [{ ...build, input }],
      destinations: [{ ...destination, slots: [{ ...destination.slots[0], input }] }],
    });

    for (const input of [
      { source: true, extra: 1 },
      { source: true, buildId: "x", targetId: "y" },
      { buildId: "x" },
    ]) {
      expect(
        validateReleaseConfigShape(withRefs(input)).some((issue) => issue.path?.endsWith("input")),
      ).toBe(true);
    }
    expect(validateReleaseConfigShape(withRefs({ source: true }))).toEqual([]);
    expect(validateReleaseConfigShape(withRefs({ buildId: "x", targetId: "y" }))).toEqual([]);
  });

  it("rejects unsupported build-target input references", () => {
    const config = createReleaseConfig({
      id: "workflow",
      project: "project",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    const invalid = {
      ...config,
      builds: [
        {
          id: "build",
          type: "desktop",
          engine: "engine",
          enabled: true,
          config: {},
          targets: [{ id: "target", enabled: true, config: {}, input: { source: true } }],
        },
      ],
    };

    expect(() => parseReleaseConfig(invalid)).toThrow("Build target input is not supported");
  });

  it("rejects output references with missing or unexpected fields", () => {
    const config = createReleaseConfig({
      id: "r",
      project: "p",
      name: "n",
      source: { provider: "source", config: {} },
    });
    const invalid = {
      ...config,
      destinations: [
        {
          id: "destination",
          provider: "destination",
          enabled: true,
          config: {},
          slots: [
            {
              id: "slot",
              enabled: true,
              input: { buildId: "build-only" },
              config: {},
            },
          ],
        },
      ],
    };
    expect(() => parseReleaseConfig(invalid)).toThrow("Destination slots require");
  });

  it("creates and round-trips a structurally valid draft", () => {
    const config = createReleaseConfig({
      id: "r",
      project: "p",
      name: "n",
      source: { provider: "source", config: {} },
    });
    expect(parseReleaseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });

  it("rejects IDs that could escape persisted workflow paths", () => {
    const config = createReleaseConfig({
      id: "../connections",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    expect(() => parseReleaseConfig(config)).toThrow("safe non-empty persisted ID");
  });

  it("rejects unsafe project IDs used by persisted artifacts", () => {
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "../project",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    expect(() => parseReleaseConfig(config)).toThrow("project must be a safe");
  });

  it("rejects malformed optional Pipelab-owned fields", () => {
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
      description: "valid",
    });
    expect(() =>
      parseReleaseConfig({
        ...config,
        description: 42,
        builds: [],
        destinations: [
          {
            id: "destination-1",
            provider: "destination",
            enabled: true,
            config: {},
            slots: [{ id: "slot-1", name: 42, enabled: true, config: {} }],
          },
        ],
      }),
    ).toThrow("description");
  });

  it("reports missing and wrong-integration connection references", () => {
    const config = createReleaseConfig({
      id: "r",
      project: "p",
      name: "n",
      source: { provider: "source", config: { account: "missing" } },
    });
    const registry: ReleaseRegistry = {
      sources: [
        {
          id: "source",
          label: "Source",
          fields: [{ key: "account", type: "connection", label: "Account", integration: "github" }],
          output: { kind: "project", container: "directory" },
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({
            steps: [],
            artifact: {
              reference: { stepId: "source", artifact: "output" },
              descriptor: { kind: "project", container: "directory" },
            },
          }),
        },
      ],
      producers: [],
      destinations: [],
    };
    expect(
      validateReleaseConnectionReferences(config, registry, {
        version: "1.0.0",
        connections: [],
      })[0].code,
    ).toBe("release.connection.missing");
    const wrong = validateReleaseConnectionReferences(
      { ...config, source: { provider: "source", config: { account: "c1" } } },
      registry,
      {
        version: "1.0.0",
        connections: [
          {
            id: "c1",
            pluginName: "gitlab",
            name: "GitLab",
            createdAt: "2026-01-01",
            isDefault: false,
          },
        ],
      },
    );
    expect(wrong[0].code).toBe("release.connection.integration");
  });

  it("compares descriptors structurally regardless of key order", () => {
    expect(
      descriptorsEqual(
        { kind: "application", platform: "web", container: "directory" },
        { container: "directory", kind: "application", platform: "web" },
      ),
    ).toBe(true);
    expect(
      descriptorsEqual(
        { kind: "application", platform: "web", container: "directory" },
        { kind: "application", platform: "windows", container: "directory" },
      ),
    ).toBe(false);
  });

  it("resolves transformed target descriptors", () => {
    expect(
      resolveTargetDescriptor(
        { kind: "application", platform: "web", container: "archive", format: "zip" },
        { transform: { changes: { container: "directory" }, remove: ["format"] } },
      ),
    ).toEqual({ kind: "application", platform: "web", container: "directory" });
  });

  it("validates transformed chains and rejects semantic mismatches", () => {
    const sourceDescriptor = {
      kind: "application" as const,
      platform: "web",
      container: "archive" as const,
      format: "zip",
    };
    const registry: ReleaseRegistry = {
      sources: [
        {
          id: "source",
          label: "ZIP",
          output: sourceDescriptor,
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({
            steps: [],
            artifact: {
              reference: { stepId: "source", artifact: "output" },
              descriptor: sourceDescriptor,
            },
          }),
        },
      ],
      producers: [
        {
          id: "extract",
          label: "Extract",
          planning: { mode: "automatic" },
          accepts: { container: "archive", format: "zip" },
          targets: [
            {
              id: "output",
              label: "Extracted",
              transform: { changes: { container: "directory" }, remove: ["format"] },
              createDefaultConfig: () => ({}),
            },
          ],
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({ steps: [], artifacts: {} }),
        },
        {
          id: "electron",
          label: "Electron",
          planning: { mode: "build" },
          accepts: { kind: "application", platform: "web", container: "directory" },
          targets: [
            {
              id: "windows",
              label: "Windows",
              output: { kind: "application", platform: "windows", container: "directory" },
              createDefaultConfig: () => ({}),
            },
          ],
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({ steps: [], artifacts: {} }),
        },
      ],
      destinations: [] as ReleaseRegistry["destinations"],
    };
    const valid: ReleaseConfig = {
      version: "3.0.0",
      id: "chain",
      project: "p",
      name: "Chain",
      source: { provider: "source", config: {} },
      builds: [
        {
          id: "electron",
          type: "desktop",
          engine: "electron",
          enabled: true,
          config: {},
          targets: [{ id: "windows", enabled: true, config: {} }],
        },
      ],
      destinations: [],
    };
    expect(
      validateRelease(valid, registry, { host: { platform: "linux", architecture: "x64" } }),
    ).toEqual([]);
    const invalid = {
      ...valid,
      source: { provider: "source", config: {} },
      builds: [{ ...valid.builds[0], engine: "electron" }],
    };
    const noTransformRegistry = {
      ...registry,
      producers: registry.producers.filter((producer) => producer.id !== "extract"),
    };
    expect(
      validateRelease(invalid, noTransformRegistry, {
        host: { platform: "linux", architecture: "x64" },
      }).some((issue) => issue.code === "release.build.input.missing"),
    ).toBe(true);
  });
});
