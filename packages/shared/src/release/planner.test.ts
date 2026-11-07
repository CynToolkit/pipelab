import { describe, expect, it } from "vitest";
import { planRelease } from "./planner";
import type { ReleaseBuildProfileConfig, ReleaseConfig, ReleaseRegistry } from "./types";

const project = { kind: "project" as const, technology: "engine", container: "directory" as const };
const web = { kind: "application" as const, platform: "web", container: "directory" as const };
const registry: ReleaseRegistry = {
  sources: [
    {
      id: "source",
      label: "Source",
      output: project,
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => ({
        steps: [],
        artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: project },
      }),
    },
  ],
  producers: [
    {
      id: "engine-a",
      label: "Engine A",
      planning: { mode: "build" },
      accepts: { kind: "project", technology: "engine" },
      targets: [
        { id: "web", label: "Web", buildType: "web", output: web, createDefaultConfig: () => ({}) },
      ],
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => ({ steps: [], artifacts: {} }),
    },
    {
      id: "engine-b",
      label: "Engine B",
      planning: { mode: "build" },
      accepts: { kind: "project", technology: "engine" },
      targets: [
        { id: "web", label: "Web", buildType: "web", output: web, createDefaultConfig: () => ({}) },
      ],
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => ({ steps: [], artifacts: {} }),
    },
    {
      id: "extract",
      label: "Extract",
      planning: { mode: "automatic" },
      accepts: { container: "archive", format: "zip" },
      targets: [
        {
          id: "directory",
          label: "Directory",
          transform: { changes: { container: "directory" }, remove: ["format"] },
          createDefaultConfig: () => ({}),
        },
      ],
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => ({ steps: [], artifacts: {} }),
    },
  ],
  destinations: [
    {
      id: "deploy",
      label: "Deploy",
      accepts: { kind: "application" },
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => [],
    },
  ],
};

const config = (builds: ReleaseConfig["builds"]): ReleaseConfig => ({
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: "source", config: {} },
  builds,
  destinations: [],
});

describe("release planner", () => {
  it("keeps multiple profiles using the same engine separate", () => {
    const plan = planRelease(
      config([
        {
          id: "a",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
        {
          id: "b",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.id)).toEqual(["a", "b"]);
  });

  it("does not insert a transform when the engine accepts the source directly", () => {
    const plan = planRelease(
      config([
        {
          id: "a",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.provider)).toEqual(["engine-a"]);
  });

  it("resolves implicit inputs from profiles declared later", () => {
    const ordered: ReleaseRegistry = {
      ...registry,
      producers: [
        ...registry.producers,
        {
          ...registry.producers[1],
          id: "downstream",
          accepts: { kind: "application", platform: "web", container: "directory" },
        },
      ],
    };
    const plan = planRelease(
      config([
        {
          id: "downstream",
          type: "web",
          engine: "downstream",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
        {
          id: "upstream",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      ordered,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.producers.map((producer) => producer.id)).toEqual(["upstream", "downstream"]);
    expect(plan.producers[1].input).toEqual({ producerId: "upstream", outputId: "web" });
  });

  it("rejects a target belonging to another build type", () => {
    const plan = planRelease(
      config([
        {
          id: "a",
          type: "desktop",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues.map((issue) => issue.code)).toContain("release.build.target.type");
  });

  it("inserts declared automatic transforms", () => {
    const zip: ReleaseRegistry = {
      ...registry,
      sources: [
        {
          ...registry.sources[0],
          output: {
            kind: "application" as const,
            platform: "web",
            container: "archive" as const,
            format: "zip",
          },
        },
      ],
      producers: [
        { ...registry.producers[2] },
        {
          ...registry.producers[0],
          accepts: { kind: "application", platform: "web", container: "directory" as const },
        },
      ],
    };
    const plan = planRelease(
      config([
        {
          id: "desktop",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      zip,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.issues.map((issue) => issue.code)).not.toContain("release.build.input.ambiguous");
    expect(plan.producers.map((producer) => producer.provider)).toEqual(["extract", "engine-a"]);
    const genericZip: ReleaseRegistry = {
      ...zip,
      sources: [
        {
          ...zip.sources[0],
          output: { kind: "files" as const, container: "archive" as const, format: "zip" },
        },
      ],
    };
    expect(
      planRelease(
        config([
          {
            id: "desktop",
            type: "web",
            engine: "engine-a",
            enabled: true,
            config: {},
            targets: [{ id: "web", enabled: true, config: {} }],
          },
        ]),
        genericZip,
        { host: { platform: "linux", architecture: "x64" } },
      ).issues.map((issue) => issue.code),
    ).toContain("release.build.input.missing");
  });

  it("preserves the complete descriptor through passthrough transforms", () => {
    const passthrough: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          id: "passthrough",
          label: "Passthrough",
          planning: { mode: "automatic" },
          accepts: {},
          targets: [
            {
              id: "output",
              label: "Output",
              transform: { changes: {} },
              createDefaultConfig: () => ({}),
            },
          ],
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({ steps: [], artifacts: {} }),
        },
        {
          ...registry.producers[0],
          accepts: { kind: "application", platform: "web", container: "directory" },
        },
      ],
      sources: [
        {
          ...registry.sources[0],
          output: {
            kind: "application" as const,
            platform: "web",
            container: "directory" as const,
          },
        },
      ],
    };
    const plan = planRelease(
      config([
        {
          id: "desktop",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      passthrough,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.outputs[0].descriptor).toEqual({
      kind: "application",
      platform: "web",
      container: "directory",
    });
  });

  it("reports dynamic acceptance reasons", () => {
    const dynamic = {
      ...registry,
      destinations: [
        {
          ...registry.destinations[0],
          accepts: { kind: "project" },
          acceptsWhen: () => ({ accepted: false as const, reason: "Deployment is locked." }),
        },
      ],
    };
    const plan = planRelease(
      {
        ...config([]),
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      },
      dynamic,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues.some((issue) => issue.message === "Deployment is locked.")).toBe(true);
  });

  it("reports dynamic producer rejection reasons", () => {
    const dynamic: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          ...registry.producers[0],
          id: "locked",
          acceptsWhen: () => ({ accepted: false as const, reason: "Build is locked." }),
        },
      ],
    };
    const plan = planRelease(
      config([
        {
          id: "locked",
          type: "web",
          engine: "locked",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      dynamic,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues.some((issue) => issue.message === "Build is locked.")).toBe(true);
  });

  it("reports an unknown build engine", () => {
    const plan = planRelease(
      config([
        { id: "missing", type: "web", engine: "missing", enabled: true, config: {}, targets: [] },
      ]),
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues.map((issue) => issue.code)).toContain("release.build.engine.unknown");
  });

  it("reports cycles and ambiguous inputs", () => {
    const cycleRegistry: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          ...registry.producers[0],
          id: "cycle",
          accepts: {},
          targets: [{ id: "out", label: "Output", output: web, createDefaultConfig: () => ({}) }],
        },
      ],
    };
    const cycle = planRelease(
      config([
        {
          id: "a",
          type: "web",
          engine: "cycle",
          enabled: true,
          input: { buildId: "b", targetId: "out" },
          config: {},
          targets: [{ id: "out", enabled: true, config: {} }],
        },
        {
          id: "b",
          type: "web",
          engine: "cycle",
          enabled: true,
          input: { buildId: "a", targetId: "out" },
          config: {},
          targets: [{ id: "out", enabled: true, config: {} }],
        },
      ]),
      cycleRegistry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(cycle.issues.map((issue) => issue.code)).toContain("release.build.input.cycle");

    const mergeRegistry: ReleaseRegistry = {
      ...registry,
      producers: [
        ...registry.producers,
        {
          ...registry.producers[0],
          id: "merge",
          accepts: { kind: "application", platform: "web", container: "directory" },
          targets: [{ id: "out", label: "Output", output: web, createDefaultConfig: () => ({}) }],
        },
      ],
    };
    const ambiguous = planRelease(
      config([
        {
          id: "a",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
        {
          id: "b",
          type: "web",
          engine: "engine-b",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
        {
          id: "merge",
          type: "web",
          engine: "merge",
          enabled: true,
          config: {},
          targets: [{ id: "out", enabled: true, config: {} }],
        },
      ]),
      mergeRegistry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(ambiguous.issues.map((issue) => issue.code)).toContain("release.build.input.ambiguous");
  });

  it("rejects destination references to missing and disabled targets", () => {
    const base = config([
      {
        id: "build",
        type: "web",
        engine: "engine-a",
        enabled: true,
        config: {},
        targets: [{ id: "web", enabled: true, config: {} }],
      },
    ]);
    const missingTarget = planRelease(
      {
        ...base,
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [
              {
                id: "slot",
                enabled: true,
                input: { buildId: "build", targetId: "missing" },
                config: {},
              },
            ],
          },
        ],
      },
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(missingTarget.issues).toContainEqual(
      expect.objectContaining({
        code: "release.destination.input.invalid",
        path: "destinations.0.slots.0.input",
      }),
    );

    const disabledTarget = planRelease(
      {
        ...base,
        builds: [{ ...base.builds[0], targets: [{ id: "web", enabled: false, config: {} }] }],
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [
              {
                id: "slot",
                enabled: true,
                input: { buildId: "build", targetId: "web" },
                config: {},
              },
            ],
          },
        ],
      },
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(disabledTarget.issues).toContainEqual(
      expect.objectContaining({
        code: "release.destination.input.invalid",
        path: "destinations.0.slots.0.input",
      }),
    );

    const missingBuild = planRelease(
      {
        ...config([]),
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [
              {
                id: "slot",
                enabled: true,
                input: { buildId: "missing", targetId: "web" },
                config: {},
              },
            ],
          },
        ],
      },
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(missingBuild.issues).toContainEqual(
      expect.objectContaining({
        code: "release.build.reference.disabled",
        path: "destinations.0.slots.0.input",
      }),
    );

    const disabledBuild = planRelease(
      {
        ...base,
        builds: [{ ...base.builds[0], enabled: false }],
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [
              {
                id: "slot",
                enabled: true,
                input: { buildId: "build", targetId: "web" },
                config: {},
              },
            ],
          },
        ],
      },
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(disabledBuild.issues).toContainEqual(
      expect.objectContaining({
        code: "release.build.reference.disabled",
        path: "destinations.0.slots.0.input",
      }),
    );
  });

  it("reports an enabled destination with no configured output", () => {
    const plan = planRelease(
      {
        ...config([]),
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [{ id: "slot", enabled: true, config: {} }],
          },
        ],
      },
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: "release.destination.input.required",
        path: "destinations.0.slots.0.input",
      }),
    );
  });

  it("keeps automatic outputs internal and includes source in public outputs", () => {
    const zip: ReleaseRegistry = {
      ...registry,
      sources: [
        {
          ...registry.sources[0],
          output: {
            kind: "application" as const,
            platform: "web",
            container: "archive" as const,
            format: "zip",
          },
        },
      ],
      producers: [
        { ...registry.producers[2] },
        {
          ...registry.producers[0],
          accepts: { kind: "application", platform: "web", container: "directory" as const },
        },
      ],
    };
    const plan = planRelease(
      config([
        {
          id: "desktop",
          type: "web",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      zip,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toEqual([]);
    expect(plan.outputs.map((output) => output.ref)).toEqual([
      { source: true },
      { buildId: "desktop", targetId: "web" },
    ]);
    expect(
      plan.outputs.every(
        (output) => !("buildId" in output.ref) || !output.ref.buildId.startsWith("__auto__"),
      ),
    ).toBe(true);
  });

  it("does not crash when planning malformed configuration", () => {
    const plan = planRelease({} as ReleaseConfig, registry, {
      host: { platform: "linux", architecture: "x64" },
    });
    expect(plan.issues.some((issue) => issue.code === "release.config.version")).toBe(true);
    expect(plan.producers).toEqual([]);
    expect(plan.destinations).toEqual([]);
  });

  it("uses array indexes in build validation paths", () => {
    const plan = planRelease(
      config([
        {
          id: "desktop",
          type: "desktop",
          engine: "engine-a",
          enabled: true,
          config: {},
          targets: [{ id: "web", enabled: true, config: {} }],
        },
      ]),
      registry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ code: "release.build.target.type", path: "builds.0.targets.0" }),
    );
  });

  it("normalizes provider target and slot validation paths to indexes", () => {
    const indexedRegistry: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          ...registry.producers[0],
          validate: () => [
            {
              code: "producer.field",
              message: "Preset required",
              severity: "error" as const,
              path: "targets.web.config.preset",
            },
          ],
        },
      ],
      destinations: [
        {
          ...registry.destinations[0],
          accepts: {},
          validate: () => [
            {
              code: "destination.field",
              message: "Channel required",
              severity: "error" as const,
              path: "slots.deploy.config.channel",
            },
          ],
        },
      ],
    };
    const plan = planRelease(
      {
        ...config([
          {
            id: "desktop",
            type: "web",
            engine: "engine-a",
            enabled: true,
            config: {},
            targets: [{ id: "web", enabled: true, config: {} }],
          },
        ]),
        destinations: [
          {
            id: "deploy",
            provider: "deploy",
            enabled: true,
            config: {},
            slots: [{ id: "deploy", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      },
      indexedRegistry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ path: "builds.0.targets.0.config.preset" }),
    );
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ path: "destinations.0.slots.0.config.channel" }),
    );
  });

  it("does not treat an unresolved profile output as an implicit input", () => {
    const webSource = {
      kind: "application" as const,
      platform: "web",
      container: "directory" as const,
    };
    const godotProject = {
      kind: "project" as const,
      technology: "godot",
      container: "directory" as const,
    };
    const unresolvedRegistry: ReleaseRegistry = {
      sources: [{ ...registry.sources[0], output: webSource }],
      producers: [
        {
          ...registry.producers[0],
          id: "godot-export",
          accepts: godotProject,
          targets: [
            { id: "web", label: "Web", output: webSource, createDefaultConfig: () => ({}) },
          ],
        },
        {
          ...registry.producers[1],
          id: "web-build",
          accepts: webSource,
          targets: [
            { id: "web", label: "Web", output: webSource, createDefaultConfig: () => ({}) },
          ],
        },
      ],
      destinations: [],
    };
    const build = (id: string, engine: string): ReleaseBuildProfileConfig => ({
      id,
      type: "web",
      engine,
      enabled: true,
      config: {},
      targets: [{ id: "web", enabled: true, config: {} }],
    });
    const plans = [
      planRelease(
        config([build("a", "godot-export"), build("b", "web-build")]),
        unresolvedRegistry,
        { host: { platform: "linux", architecture: "x64" } },
      ),
      planRelease(
        config([build("b", "web-build"), build("a", "godot-export")]),
        unresolvedRegistry,
        { host: { platform: "linux", architecture: "x64" } },
      ),
      planRelease(
        config([build("z", "godot-export"), build("a", "web-build")]),
        unresolvedRegistry,
        { host: { platform: "linux", architecture: "x64" } },
      ),
      planRelease(
        config([build("a", "web-build"), build("z", "godot-export")]),
        unresolvedRegistry,
        { host: { platform: "linux", architecture: "x64" } },
      ),
    ];
    for (const plan of plans) {
      expect(plan.issues.map((issue) => issue.code)).toContain("release.build.input.missing");
      expect(plan.issues.map((issue) => issue.code)).not.toContain("release.build.input.ambiguous");
    }
  });

  it("resolves implicit inputs independently of Build Profile order", () => {
    const webSource = {
      kind: "application" as const,
      platform: "web",
      container: "directory" as const,
    };
    const webRegistry: ReleaseRegistry = {
      sources: [{ ...registry.sources[0], output: webSource }],
      producers: [
        {
          ...registry.producers[0],
          id: "engine-a",
          accepts: webSource,
          targets: [
            {
              id: "web",
              label: "Web",
              buildType: "web",
              output: webSource,
              createDefaultConfig: () => ({}),
            },
          ],
        },
        {
          ...registry.producers[0],
          id: "engine-b",
          accepts: webSource,
          targets: [
            {
              id: "web",
              label: "Web",
              buildType: "web",
              output: webSource,
              createDefaultConfig: () => ({}),
            },
          ],
        },
      ],
      destinations: [],
    };
    const buildA: ReleaseBuildProfileConfig = {
      id: "a",
      type: "web",
      engine: "engine-a",
      enabled: true,
      config: {},
      targets: [{ id: "web", enabled: true, config: {} }],
    };
    const buildB: ReleaseBuildProfileConfig = {
      id: "b",
      type: "web",
      engine: "engine-b",
      enabled: true,
      config: {},
      targets: [{ id: "web", enabled: true, config: {} }],
    };
    const ordered = (builds: ReleaseBuildProfileConfig[]) =>
      planRelease(config(builds), webRegistry, {
        host: { platform: "linux", architecture: "x64" },
      });

    for (const builds of [
      [buildA, buildB],
      [buildB, buildA],
      [
        { ...buildA, id: "z" },
        { ...buildB, id: "a" },
      ],
      [
        { ...buildB, id: "a" },
        { ...buildA, id: "z" },
      ],
    ]) {
      expect(ordered(builds).issues.map((issue) => issue.code)).toContain(
        "release.build.input.ambiguous",
      );
    }

    for (const input of [{ buildId: "a", targetId: "web" }, { source: true }] as const) {
      for (const builds of [
        [
          { ...buildA, input: { source: true as const } },
          { ...buildB, input },
        ],
        [
          { ...buildB, input },
          { ...buildA, input: { source: true as const } },
        ],
      ]) {
        expect(ordered(builds).issues).toEqual([]);
      }
    }
  });
});

describe("release planner with multi-input producers", () => {
  const windows = {
    kind: "application" as const,
    platform: "windows",
    architecture: "x64",
    container: "directory" as const,
  };
  const linux = { ...windows, platform: "linux" };
  const macos = { ...windows, platform: "macos" };
  const bundleOutput = {
    kind: "application" as const,
    platform: "desktop-bundle",
    container: "archive" as const,
    format: "zip",
  };
  const postOutput = {
    kind: "application" as const,
    platform: "web",
    container: "directory" as const,
  };
  const bundleRegistry: ReleaseRegistry = {
    sources: registry.sources,
    producers: [
      {
        id: "engine",
        label: "Engine",
        planning: { mode: "build" },
        accepts: { kind: "project", technology: "engine" },
        targets: [
          {
            id: "windows",
            label: "Windows",
            buildType: "desktop",
            output: windows,
            createDefaultConfig: () => ({}),
          },
          {
            id: "linux",
            label: "Linux",
            buildType: "desktop",
            output: linux,
            createDefaultConfig: () => ({}),
          },
          {
            id: "macos",
            label: "macOS",
            buildType: "desktop",
            output: macos,
            createDefaultConfig: () => ({}),
          },
        ],
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: () => ({ steps: [], artifacts: {} }),
      },
      {
        id: "bundle",
        label: "Bundle",
        planning: { mode: "build" },
        inputs: "many",
        accepts: { kind: "application" },
        targets: [
          {
            id: "zip",
            label: "Zip",
            buildType: "desktop",
            output: bundleOutput,
            createDefaultConfig: () => ({}),
          },
        ],
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: () => ({ steps: [], artifacts: {} }),
        compileMany: () => ({ steps: [], artifacts: {} }),
      },
      {
        id: "post",
        label: "Post",
        planning: { mode: "build" },
        accepts: { kind: "application", format: "zip" },
        targets: [
          {
            id: "out",
            label: "Out",
            buildType: "web",
            output: postOutput,
            createDefaultConfig: () => ({}),
          },
        ],
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: () => ({ steps: [], artifacts: {} }),
      },
    ],
    destinations: registry.destinations,
  };
  const engineBuild = (id: string, targetId: string, enabled = true) => ({
    id,
    type: "desktop",
    engine: "engine",
    enabled: true,
    config: {},
    targets: [{ id: targetId, enabled, config: {} }],
  });
  const threeEngines = [
    engineBuild("win", "windows"),
    engineBuild("lin", "linux"),
    engineBuild("mac", "macos"),
  ];
  const bundleBuild = (
    inputs: ReleaseBuildProfileConfig["inputs"],
    extra: Partial<ReleaseBuildProfileConfig> = {},
  ) => ({
    id: "bundle",
    type: "desktop",
    engine: "bundle",
    enabled: true,
    config: {},
    targets: [{ id: "zip", enabled: true, config: {} }],
    inputs,
    ...extra,
  });
  const plan = (builds: ReleaseBuildProfileConfig[], extra: Partial<ReleaseConfig> = {}) =>
    planRelease({ ...config(builds), ...extra }, bundleRegistry, {
      host: { platform: "linux", architecture: "x64" },
    });
  const threeInputs = [
    { buildId: "win", targetId: "windows" },
    { buildId: "lin", targetId: "linux" },
    { buildId: "mac", targetId: "macos" },
  ];
  const codes = (result: ReturnType<typeof plan>) => result.issues.map((issue) => issue.code);

  it("plans a bundle with three explicit inputs in declared order", () => {
    const result = plan([...threeEngines, bundleBuild(threeInputs)]);
    expect(result.issues).toEqual([]);
    const bundle = result.producers.find((producer) => producer.id === "bundle");
    expect(bundle?.inputs).toEqual([
      { producerId: "win", outputId: "windows" },
      { producerId: "lin", outputId: "linux" },
      { producerId: "mac", outputId: "macos" },
    ]);
    expect(bundle?.input).toBeUndefined();
    expect(result.outputs.map((output) => output.ref)).toContainEqual({
      buildId: "bundle",
      targetId: "zip",
    });
    expect(
      result.graph.edges.filter((edge) => edge.to === "bundle").map((edge) => edge.from),
    ).toEqual(["win", "lin", "mac"]);
  });

  it("requires at least one input for a multi-input build", () => {
    expect(codes(plan([...threeEngines, bundleBuild(undefined)]))).toContain(
      "release.build.inputs.required",
    );
    expect(codes(plan([...threeEngines, bundleBuild([])]))).toContain(
      "release.build.inputs.required",
    );
  });

  it("rejects a singular input on a multi-input build", () => {
    const result = plan([
      ...threeEngines,
      bundleBuild(threeInputs, { input: { buildId: "win", targetId: "windows" } }),
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "release.build.input.unsupported", path: "builds.3.input" }),
    );
  });

  it("rejects the inputs list on a single-input build", () => {
    const result = plan([
      ...threeEngines,
      {
        id: "single",
        type: "desktop",
        engine: "engine",
        enabled: true,
        config: {},
        inputs: threeInputs,
        targets: [{ id: "windows", enabled: true, config: {} }],
      },
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "release.build.inputs.unsupported",
        path: "builds.3.inputs",
      }),
    );
  });

  it("reports malformed input references in the config shape", () => {
    const result = plan([...threeEngines, bundleBuild([{ buildId: "win" } as never])]);
    expect(codes(result)).toContain("release.build.inputs.invalid");
  });

  it("reports duplicate inputs with the index of the repeated reference", () => {
    const result = plan([
      ...threeEngines,
      bundleBuild([threeInputs[0], threeInputs[1], threeInputs[0]]),
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "release.build.inputs.duplicate",
        path: "builds.3.inputs.2",
      }),
    );
  });

  it("rejects a bundle that consumes itself", () => {
    const result = plan([
      ...threeEngines,
      bundleBuild([threeInputs[0], { buildId: "bundle", targetId: "zip" }]),
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "release.build.input.cycle", path: "builds.3.inputs.1" }),
    );
  });

  it("rejects transitive cycles between bundles", () => {
    const first = { ...bundleBuild([{ buildId: "second", targetId: "zip" }]), id: "first" };
    const second = { ...bundleBuild([{ buildId: "first", targetId: "zip" }]), id: "second" };
    expect(codes(plan([...threeEngines, first, second]))).toContain("release.build.input.cycle");
  });

  it("rejects a single-input build feeding back into the bundle it consumes", () => {
    const result = plan([
      ...threeEngines,
      bundleBuild([threeInputs[0], { buildId: "post", targetId: "out" }]),
      {
        id: "post",
        type: "web",
        engine: "post",
        enabled: true,
        config: {},
        input: { buildId: "bundle", targetId: "zip" },
        targets: [{ id: "out", enabled: true, config: {} }],
      },
    ]);
    expect(codes(result)).toContain("release.build.input.cycle");
  });

  it("rejects an input whose descriptor the bundle does not accept", () => {
    const result = plan([...threeEngines, bundleBuild([{ source: true }, threeInputs[0]])]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "release.build.inputs.rejected", path: "builds.3.inputs.0" }),
    );
  });

  it("rejects inputs that reference a disabled build or target", () => {
    const disabledBuild = plan([
      ...threeEngines.slice(0, 2),
      { ...engineBuild("mac", "macos"), enabled: false },
      bundleBuild(threeInputs),
    ]);
    expect(disabledBuild.issues).toContainEqual(
      expect.objectContaining({
        code: "release.build.reference.disabled",
        path: "builds.3.inputs.2",
      }),
    );
    const disabledTarget = plan([
      ...threeEngines.slice(0, 2),
      engineBuild("mac", "macos", false),
      bundleBuild(threeInputs),
    ]);
    expect(disabledTarget.issues.map((issue) => issue.code)).toContain(
      "release.destination.input.invalid",
    );
    expect(disabledTarget.producers.find((producer) => producer.id === "bundle")).toBeUndefined();
  });

  it("lets a destination slot consume a bundle output", () => {
    const result = plan([...threeEngines, bundleBuild(threeInputs)], {
      destinations: [
        {
          id: "deploy",
          provider: "deploy",
          name: "Deploy",
          enabled: true,
          config: {},
          slots: [
            {
              id: "main",
              enabled: true,
              input: { buildId: "bundle", targetId: "zip" },
              config: {},
            },
          ],
        },
      ],
    });
    expect(result.issues).toEqual([]);
    expect(result.destinations[0].slots[0].input).toEqual({
      producerId: "bundle",
      outputId: "zip",
    });
  });

  it("lets a single-input build implicitly consume a bundle output it accepts", () => {
    const result = plan([
      ...threeEngines,
      bundleBuild(threeInputs),
      {
        id: "post",
        type: "web",
        engine: "post",
        enabled: true,
        config: {},
        targets: [{ id: "out", enabled: true, config: {} }],
      },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.producers.find((producer) => producer.id === "post")?.input).toEqual({
      producerId: "bundle",
      outputId: "zip",
    });
  });

  it("plans a bundle of a bundle", () => {
    const outer = {
      id: "outer",
      type: "desktop",
      engine: "bundle",
      enabled: true,
      config: {},
      targets: [{ id: "zip", enabled: true, config: {} }],
      inputs: [
        { buildId: "bundle", targetId: "zip" },
        { buildId: "mac", targetId: "macos" },
      ],
    };
    const result = plan([...threeEngines, bundleBuild(threeInputs), outer]);
    expect(result.issues).toEqual([]);
    expect(result.producers.find((producer) => producer.id === "outer")?.inputs).toEqual([
      { producerId: "bundle", outputId: "zip" },
      { producerId: "mac", outputId: "macos" },
    ]);
  });

  it("still detects a cycle through a nested bundle", () => {
    const outer = {
      id: "outer",
      type: "desktop",
      engine: "bundle",
      enabled: true,
      config: {},
      targets: [{ id: "zip", enabled: true, config: {} }],
      inputs: [{ buildId: "bundle", targetId: "zip" }],
    };
    const result = plan([
      ...threeEngines,
      bundleBuild([{ buildId: "outer", targetId: "zip" }, threeInputs[0]]),
      outer,
    ]);
    expect(codes(result)).toContain("release.build.input.cycle");
  });
});
