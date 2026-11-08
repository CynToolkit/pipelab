import { describe, expect, it } from "vitest";
import { compileReleasePlan, compileWorkflow } from "./compiler";
import { planRelease } from "./planner";
import type {
  ReleaseCompileContext,
  ReleaseConfig,
  ReleaseDestinationDefinition,
  ReleaseOutputRef,
  ReleaseProducerDefinition,
  ReleaseRegistry,
} from "./types";
import { runWorkflow, type WorkflowHost, type WorkflowStep } from "@pipelab/workflow-runtime";

const sourceDescriptor = {
  kind: "project" as const,
  technology: "fake",
  container: "directory" as const,
};
const appDescriptor = {
  kind: "application" as const,
  platform: "windows",
  architecture: "x64",
  container: "directory" as const,
};

const registry: ReleaseRegistry = {
  sources: [
    {
      id: "fake/source",
      label: "Fake source",
      output: sourceDescriptor,
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => ({
        steps: [
          {
            id: "source",
            uses: "fake/source",
            artifacts: { output: { descriptor: sourceDescriptor } },
          },
        ],
        artifact: {
          reference: { stepId: "source", artifact: "output" },
          descriptor: sourceDescriptor,
        },
      }),
    },
  ],
  producers: [
    {
      id: "fake/producer",
      label: "Fake producer",
      planning: { mode: "build" },
      accepts: { kind: "project", technology: "fake" },
      targets: [
        {
          id: "windows-x64",
          label: "Windows",
          buildType: "desktop",
          output: appDescriptor,
          createDefaultConfig: () => ({}),
        },
      ],
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: (input) => ({
        steps: [
          {
            id: "build",
            uses: "fake/build",
            needs: [input.reference.stepId],
            artifactInputs: { input: input.reference },
            artifacts: { output: { descriptor: appDescriptor } },
          },
        ],
        artifacts: {
          "windows-x64": {
            reference: { stepId: "build", artifact: "output" },
            descriptor: appDescriptor,
          },
        },
      }),
    },
  ],
  destinations: [
    {
      id: "fake/destination",
      label: "Fake destination",
      accepts: { kind: "application", platform: "windows" },
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: (artifact, destination, slot) => [
        {
          id: `delivery-${destination.id}-${slot.id}`,
          uses: "fake/deliver",
          needs: [artifact.reference.stepId],
          artifactInputs: { folder: artifact.reference },
          delivery: {
            destinationId: destination.id,
            slotId: slot.id,
            artifact: artifact.reference,
          },
        },
      ],
    },
  ],
};

const config = (overrides: Partial<ReleaseConfig> = {}): ReleaseConfig => ({
  version: "3.0.0",
  id: "release",
  project: "project",
  name: "Release",
  source: { provider: "fake/source", config: {} },
  builds: [
    {
      id: "build",
      type: "desktop",
      engine: "fake/producer",
      enabled: true,
      config: {},
      targets: [{ id: "windows-x64", enabled: true, config: {} }],
    },
  ],
  destinations: [
    {
      id: "ship",
      provider: "fake/destination",
      enabled: true,
      config: {},
      slots: [
        {
          id: "windows",
          enabled: true,
          input: { buildId: "build", targetId: "windows-x64" },
          config: {},
        },
      ],
    },
  ],
  ...overrides,
});

describe("generic release compiler", () => {
  it("lowers Build Profiles into a generic workflow", () => {
    const workflow = compileWorkflow(config(), registry, {
      host: { platform: "linux", architecture: "x64" },
    });
    expect(workflow.steps.map((step) => step.uses)).toEqual([
      "fake/source",
      "fake/build",
      "fake/deliver",
    ]);
    expect(workflow.steps[2].artifactInputs?.folder).toEqual({
      stepId: "build",
      artifact: "output",
    });
  });

  it("copies the profile input and chains each beforeBuild hook into its producer", () => {
    const hookedBuild = Object.assign(config().builds[0], {
      beforeBuild: [
        {
          id: "sdk-wrapper",
          enabled: true,
          command: "node ./setSDKEnabled.js 0",
        },
      ],
    });
    const hookedConfig = config({ version: "3.1.0", builds: [hookedBuild] });
    const hookRegistry: ReleaseRegistry = {
      ...registry,
      producers: [Object.assign({}, registry.producers[0], { supportsBeforeBuildHooks: true })],
    };

    const workflow = compileWorkflow(hookedConfig, hookRegistry, {
      host: { platform: "linux", architecture: "x64" },
      variables: { workspace: "/run/workspace", buildStaging: "/run/staging" },
    });
    const copy = workflow.steps.find((step) => step.id === "release-hook-copy-build");
    const hook = workflow.steps.find(
      (step) => step.id === "release-before-build-build-sdk-wrapper",
    );
    const build = workflow.steps.find((step) => step.id === "build");

    expect(copy).toMatchObject({
      uses: "@pipelab/core/fs/copy",
      needs: ["source"],
      artifactInputs: { from: { stepId: "source", artifact: "output" } },
      with: { to: "${{ variables.buildStaging }}/build" },
      artifacts: { output: { descriptor: sourceDescriptor } },
    });
    expect(hook).toMatchObject({
      uses: "@pipelab/core/release/before-build",
      needs: ["release-hook-copy-build"],
      artifactInputs: {
        input: { stepId: "release-hook-copy-build", artifact: "output" },
      },
      with: { command: "node ./setSDKEnabled.js 0" },
      artifacts: { output: { descriptor: sourceDescriptor } },
    });
    expect(build?.artifactInputs?.input).toEqual({
      stepId: "release-before-build-build-sdk-wrapper",
      artifact: "output",
    });
  });

  it("compiles an explicit producer chain", () => {
    const chainRegistry: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          ...registry.producers[0],
          id: "fake/a",
          targets: [
            {
              id: "app",
              label: "App",
              output: { kind: "application", platform: "web", container: "directory" },
              createDefaultConfig: () => ({}),
            },
          ],
          compile: (input) => ({
            steps: [
              {
                id: "a",
                uses: "fake/a",
                needs: [input.reference.stepId],
                artifactInputs: { input: input.reference },
                artifacts: {
                  output: {
                    descriptor: { kind: "application", platform: "web", container: "directory" },
                  },
                },
              },
            ],
            artifacts: {
              app: {
                reference: { stepId: "a", artifact: "output" },
                descriptor: { kind: "application", platform: "web", container: "directory" },
              },
            },
          }),
        },
        {
          ...registry.producers[0],
          id: "fake/b",
          accepts: { kind: "application", platform: "web", container: "directory" },
          targets: [
            {
              id: "archive",
              label: "Archive",
              output: { kind: "files", container: "archive", format: "zip" },
              createDefaultConfig: () => ({}),
            },
          ],
          compile: (input) => ({
            steps: [
              {
                id: "b",
                uses: "fake/b",
                needs: [input.reference.stepId],
                artifactInputs: { input: input.reference },
                artifacts: {
                  output: { descriptor: { kind: "files", container: "archive", format: "zip" } },
                },
              },
            ],
            artifacts: {
              archive: {
                reference: { stepId: "b", artifact: "output" },
                descriptor: { kind: "files", container: "archive", format: "zip" },
              },
            },
          }),
        },
      ],
      destinations: [
        {
          ...registry.destinations[0],
          id: "archive-destination",
          accepts: { kind: "files", container: "archive" },
          compile: (artifact) => [
            {
              id: "deploy",
              uses: "fake/deploy",
              needs: [artifact.reference.stepId],
              artifactInputs: { input: artifact.reference },
            },
          ],
        },
      ],
    };
    const chained: ReleaseConfig = {
      ...config({ id: "chain" }),
      builds: [
        {
          id: "a",
          type: "web",
          engine: "fake/a",
          enabled: true,
          config: {},
          targets: [{ id: "app", enabled: true, config: {} }],
        },
        {
          id: "b",
          type: "web",
          engine: "fake/b",
          enabled: true,
          input: { buildId: "a", targetId: "app" },
          config: {},
          targets: [{ id: "archive", enabled: true, config: {} }],
        },
      ],
      destinations: [
        {
          id: "deploy",
          provider: "archive-destination",
          enabled: true,
          config: {},
          slots: [
            {
              id: "archive",
              enabled: true,
              input: { buildId: "b", targetId: "archive" },
              config: {},
            },
          ],
        },
      ],
    };
    const workflow = compileWorkflow(chained, chainRegistry, {
      host: { platform: "linux", architecture: "x64" },
    });
    expect(workflow.steps.map((step) => step.id)).toEqual(["source", "a", "b", "deploy"]);
  });

  it("compiles one producer once for multiple destinations", () => {
    const fanoutRegistry: ReleaseRegistry = {
      ...registry,
      destinations: [
        {
          ...registry.destinations[0],
          id: "destination-a",
          compile: (artifact) => [
            {
              id: "deliver-a",
              uses: "fake/deliver-a",
              artifactInputs: { input: artifact.reference },
              delivery: {
                destinationId: "a",
                slotId: "slot-a",
                artifact: artifact.reference,
              },
            },
          ],
        },
        {
          ...registry.destinations[0],
          id: "destination-b",
          compile: (artifact) => [
            {
              id: "deliver-b",
              uses: "fake/deliver-b",
              artifactInputs: { input: artifact.reference },
              delivery: {
                destinationId: "b",
                slotId: "slot-b",
                artifact: artifact.reference,
              },
            },
          ],
        },
      ],
    };
    const workflow = compileWorkflow(
      config({
        destinations: [
          {
            ...config().destinations[0],
            id: "a",
            provider: "destination-a",
            slots: [
              {
                id: "slot-a",
                enabled: true,
                input: { buildId: "build", targetId: "windows-x64" },
                config: {},
              },
            ],
          },
          {
            ...config().destinations[0],
            id: "b",
            provider: "destination-b",
            slots: [
              {
                id: "slot-b",
                enabled: true,
                input: { buildId: "build", targetId: "windows-x64" },
                config: {},
              },
            ],
          },
        ],
      }),
      fanoutRegistry,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(workflow.steps.map((step) => step.id)).toEqual([
      "source",
      "build",
      "deliver-a",
      "deliver-b",
    ]);
    expect(workflow.steps.filter((step) => step.uses === "fake/build")).toHaveLength(1);
    expect(workflow.steps[2].artifactInputs?.input).toEqual({
      stepId: "build",
      artifact: "output",
    });
    expect(workflow.steps[3].artifactInputs?.input).toEqual({
      stepId: "build",
      artifact: "output",
    });
  });

  it("runs a compiled fake source, producer, and destination end to end", async () => {
    const workflow = compileWorkflow(config(), registry, {
      host: { platform: "linux", architecture: "x64" },
    });
    const paths: string[] = [];
    const host: WorkflowHost = {
      workspace: { root: "/tmp" },
      filesystem: { ensureDirectory: async () => undefined },
      processes: { execute: async () => ({ exitCode: 0, stdout: "", stderr: "", duration: 0 }) },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    };
    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "fake/source": async ({ setArtifact }) => setArtifact("output", "/workspace/source"),
        "fake/build": async ({ inputs, setArtifact }) => {
          paths.push(inputs.input as string);
          setArtifact("output", "/workspace/build");
        },
        "fake/deliver": async ({ inputs, delivery }) => {
          paths.push(inputs.folder as string, delivery!.artifact.path);
        },
      },
    });
    expect(paths).toEqual(["/workspace/source", "/workspace/build", "/workspace/build"]);
    expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
      "/workspace/source",
      "/workspace/build",
    ]);
  });

  it("allows a destination to consume the source directly", () => {
    const directRegistry: ReleaseRegistry = {
      ...registry,
      destinations: [
        {
          ...registry.destinations[0],
          id: "direct",
          accepts: sourceDescriptor,
          compile: (artifact) => [
            {
              id: "direct-deploy",
              uses: "fake/direct",
              needs: [artifact.reference.stepId],
              artifactInputs: { input: artifact.reference },
            },
          ],
        },
      ],
    };
    const direct: ReleaseConfig = {
      ...config({
        builds: [],
        destinations: [
          {
            id: "deploy",
            provider: "direct",
            enabled: true,
            config: {},
            slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      }),
    };
    expect(
      compileWorkflow(direct, directRegistry, {
        host: { platform: "linux", architecture: "x64" },
      }).steps.map((step) => step.id),
    ).toEqual(["source", "direct-deploy"]);
  });

  it("requires planned outputs but leaves compatibility to the planner", () => {
    const mismatched = {
      ...registry.producers[0],
      compile: () => ({
        steps: [
          {
            id: "build",
            uses: "fake/build",
            artifacts: { output: { descriptor: appDescriptor } },
          },
        ] as WorkflowStep[],
        artifacts: {
          "windows-x64": {
            reference: { stepId: "build", artifact: "output" },
            descriptor: {
              kind: "application" as const,
              platform: "linux",
              container: "directory" as const,
            },
          },
        },
      }),
    };
    const missing = {
      ...registry.producers[0],
      compile: () => ({ steps: [] as WorkflowStep[], artifacts: {} }),
    };
    expect(() =>
      compileWorkflow(
        config(),
        { ...registry, producers: [mismatched] },
        { host: { platform: "linux", architecture: "x64" } },
      ),
    ).not.toThrow();
    expect(() =>
      compileWorkflow(
        config(),
        { ...registry, producers: [missing] },
        { host: { platform: "linux", architecture: "x64" } },
      ),
    ).toThrow(/did not compile artifact/);
  });

  it("rejects a compiled source artifact that points to an undeclared artifact", () => {
    const invalidSource: ReleaseRegistry = {
      ...registry,
      sources: [
        {
          ...registry.sources[0],
          compile: () => ({
            steps: registry.sources[0].compile(
              {},
              { host: { platform: "linux", architecture: "x64" } },
            ).steps,
            artifact: {
              reference: { stepId: "source", artifact: "missing" },
              descriptor: sourceDescriptor,
            },
          }),
        },
      ],
    };
    expect(() =>
      compileWorkflow(config(), invalidSource, {
        host: { platform: "linux", architecture: "x64" },
      }),
    ).toThrow(
      'Compiled source artifact references undeclared artifact "missing" on workflow step "source"',
    );
  });

  it("rejects a compiled producer artifact that points to an unknown step", () => {
    const invalidProducer: ReleaseRegistry = {
      ...registry,
      producers: [
        {
          ...registry.producers[0],
          compile: () => ({
            steps: [
              {
                id: "build",
                uses: "fake/build",
                artifacts: { output: { descriptor: appDescriptor } },
              },
            ],
            artifacts: {
              "windows-x64": {
                reference: { stepId: "missing", artifact: "output" },
                descriptor: appDescriptor,
              },
            },
          }),
        },
      ],
    };
    expect(() =>
      compileWorkflow(config(), invalidProducer, {
        host: { platform: "linux", architecture: "x64" },
      }),
    ).toThrow(
      'Compiled producer build artifact "output" references unknown workflow step "missing"',
    );
  });

  it("refuses to compile a plan containing errors", () => {
    const plan = planRelease(config(), registry, {
      host: { platform: "linux", architecture: "x64" },
    });
    plan.issues.push({
      severity: "error",
      code: "test.error",
      message: "planner rejected this release",
    });
    expect(() =>
      compileReleasePlan(config(), plan, registry, {
        host: { platform: "linux", architecture: "x64" },
      }),
    ).toThrow("planner rejected this release");
  });

  it("fails clearly when a planned artifact reference cannot be resolved", () => {
    const plan = planRelease(config({ builds: [], destinations: [] }), registry, {
      host: { platform: "linux", architecture: "x64" },
    });
    plan.producers.push({
      id: "broken",
      provider: "fake/producer",
      enabled: true,
      input: { producerId: "missing", outputId: "output" },
      config: {},
      targets: [{ id: "output", enabled: true, config: {} }],
    });
    plan.destinations.push({
      id: "ship",
      provider: "fake/destination",
      enabled: true,
      config: {},
      slots: [
        {
          id: "windows",
          enabled: true,
          input: { producerId: "broken", outputId: "output" },
          config: {},
        },
      ],
    });
    expect(() =>
      compileReleasePlan(config({ builds: [], destinations: [] }), plan, registry, {
        host: { platform: "linux", architecture: "x64" },
      }),
    ).toThrow(/unknown artifact/);
  });

  it("compiles an automatic transform before a Build Profile", () => {
    const zip = {
      kind: "application" as const,
      platform: "web",
      container: "archive" as const,
      format: "zip",
    };
    const directory = {
      kind: "application" as const,
      platform: "web",
      container: "directory" as const,
    };
    const transformed: ReleaseRegistry = {
      sources: [
        {
          id: "zip/source",
          label: "Web ZIP",
          output: zip,
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: () => ({
            steps: [
              { id: "source", uses: "zip/source", artifacts: { output: { descriptor: zip } } },
            ],
            artifact: { reference: { stepId: "source", artifact: "output" }, descriptor: zip },
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
              label: "Directory",
              transform: { changes: { container: "directory" }, remove: ["format"] },
              createDefaultConfig: () => ({}),
            },
          ],
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: (input, producer) => ({
            steps: [
              {
                id: producer.id,
                uses: "extract",
                artifactInputs: { file: input.reference },
                artifacts: { output: { descriptor: directory } },
              },
            ],
            artifacts: {
              output: {
                reference: { stepId: producer.id, artifact: "output" },
                descriptor: directory,
              },
            },
          }),
        },
        {
          id: "engine",
          label: "Engine",
          planning: { mode: "build" },
          accepts: directory,
          targets: [
            {
              id: "windows",
              label: "Windows",
              output: appDescriptor,
              createDefaultConfig: () => ({}),
            },
          ],
          createDefaultConfig: () => ({}),
          validate: () => [],
          compile: (input, producer) => ({
            steps: [
              {
                id: producer.id,
                uses: "engine",
                artifactInputs: { input: input.reference },
                artifacts: { output: { descriptor: appDescriptor } },
              },
            ],
            artifacts: {
              windows: {
                reference: { stepId: producer.id, artifact: "output" },
                descriptor: appDescriptor,
              },
            },
          }),
        },
      ],
      destinations: [registry.destinations[0]],
    };
    const workflow = compileWorkflow(
      {
        version: "3.0.0",
        id: "transform",
        project: "project",
        name: "Transform",
        source: { provider: "zip/source", config: {} },
        builds: [
          {
            id: "engine",
            type: "desktop",
            engine: "engine",
            enabled: true,
            config: {},
            targets: [{ id: "windows", enabled: true, config: {} }],
          },
        ],
        destinations: [
          {
            id: "ship",
            provider: "fake/destination",
            enabled: true,
            config: {},
            slots: [
              {
                id: "windows",
                enabled: true,
                input: { buildId: "engine", targetId: "windows" },
                config: {},
              },
            ],
          },
        ],
      },
      transformed,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(workflow.steps.map((step) => step.uses)).toEqual([
      "zip/source",
      "extract",
      "engine",
      "fake/deliver",
    ]);
  });
});

describe("producer compile context", () => {
  const exportProducer = (
    seenContexts: Array<ReleaseCompileContext | undefined>,
  ): ReleaseProducerDefinition => ({
    id: "fake/export",
    label: "Fake export",
    planning: { mode: "build" },
    accepts: { kind: "project", technology: "fake" },
    targets: [
      {
        id: "windows-x64",
        label: "Windows",
        buildType: "desktop",
        output: appDescriptor,
        createDefaultConfig: () => ({}),
      },
    ],
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: (_input, _producer, context) => {
      seenContexts.push(context);
      return {
        steps: [
          {
            id: "export",
            uses: "fake/export",
            with: { file: "project.c3p" },
            artifacts: { output: { descriptor: appDescriptor } },
          },
        ],
        artifacts: {
          "windows-x64": {
            reference: { stepId: "export", artifact: "output" },
            descriptor: appDescriptor,
          },
        },
      };
    },
  });

  const exportConfig = (overrides: Partial<ReleaseConfig> = {}): ReleaseConfig =>
    config({
      source: { provider: "fake/source", config: { path: "project.c3p" } },
      builds: [
        {
          id: "export",
          type: "desktop",
          engine: "fake/export",
          enabled: true,
          config: {},
          targets: [{ id: "windows-x64", enabled: true, config: {} }],
        },
      ],
      destinations: [
        {
          id: "ship",
          provider: "fake/destination",
          enabled: true,
          config: {},
          slots: [
            {
              id: "windows",
              enabled: true,
              input: { buildId: "export", targetId: "windows-x64" },
              config: {},
            },
          ],
        },
      ],
      ...overrides,
    });

  it("passes the source config to producer compile", () => {
    const seen: Array<ReleaseCompileContext | undefined> = [];
    compileWorkflow(
      exportConfig(),
      { ...registry, producers: [exportProducer(seen)] },
      {
        host: { platform: "linux", architecture: "x64" },
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.sourceConfig).toEqual({ path: "project.c3p" });
  });
});

describe("multi-input producer compilation", () => {
  const bundleDescriptor = {
    kind: "application" as const,
    platform: "desktop-bundle",
    container: "archive" as const,
    format: "zip",
  };
  const perBuildProducer: ReleaseProducerDefinition = {
    ...registry.producers[0],
    compile: (input, producer) => ({
      steps: [
        {
          id: `build-${producer.id}`,
          uses: "fake/build",
          needs: [input.reference.stepId],
          artifactInputs: { input: input.reference },
          artifacts: { output: { descriptor: appDescriptor } },
        },
      ],
      artifacts: {
        "windows-x64": {
          reference: { stepId: `build-${producer.id}`, artifact: "output" },
          descriptor: appDescriptor,
        },
      },
    }),
  };
  const compiledInputs: Array<{ producerId: string; labels: string[]; refs: unknown[] }> = [];
  const bundleProducer: ReleaseProducerDefinition = {
    id: "fake/bundle",
    label: "Fake bundle",
    planning: { mode: "build" },
    inputs: "many",
    accepts: { kind: "application" },
    targets: [
      {
        id: "zip",
        label: "Zip",
        buildType: "desktop",
        output: bundleDescriptor,
        createDefaultConfig: () => ({}),
      },
    ],
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: () => {
      throw new Error("multi-input producers compile through compileMany");
    },
    compileMany: (inputs, producer) => {
      compiledInputs.push({
        producerId: producer.id,
        labels: inputs.map((input) => input.label),
        refs: inputs.map((input) => input.ref),
      });
      return {
        steps: [
          {
            id: `bundle-${producer.id}`,
            uses: "fake/bundle",
            artifactInputs: Object.fromEntries(
              inputs.map((input, index) => [`input${index}`, input.artifact.reference]),
            ),
            artifacts: { output: { descriptor: bundleDescriptor } },
          },
        ],
        artifacts: {
          zip: {
            reference: { stepId: `bundle-${producer.id}`, artifact: "output" },
            descriptor: bundleDescriptor,
          },
        },
      };
    },
  };
  const multiRegistry: ReleaseRegistry = {
    ...registry,
    producers: [perBuildProducer, bundleProducer],
    destinations: [
      ...registry.destinations,
      {
        id: "fake/archive",
        label: "Fake archive",
        accepts: { kind: "application" },
        createDefaultConfig: () => ({}),
        validate: () => [],
        compile: (artifact, destination, slot) => [
          {
            id: `archive-${destination.id}-${slot.id}`,
            uses: "fake/archive",
            needs: [artifact.reference.stepId],
            artifactInputs: { folder: artifact.reference },
          },
        ],
      },
    ],
  };
  const build = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      type: "desktop",
      engine: "fake/producer",
      enabled: true,
      config: {},
      targets: [{ id: "windows-x64", enabled: true, config: {} }],
      ...extra,
    }) as ReleaseConfig["builds"][number];
  const bundle = (inputs: ReleaseConfig["builds"][number]["inputs"], id = "bundle") =>
    build(id, {
      engine: "fake/bundle",
      targets: [{ id: "zip", enabled: true, config: {} }],
      inputs,
    });
  const archiveDestination = (buildId: string, targetId: string): ReleaseConfig["destinations"] => [
    {
      id: "archive",
      provider: "fake/archive",
      enabled: true,
      config: {},
      slots: [{ id: "main", enabled: true, input: { buildId, targetId }, config: {} }],
    },
  ];
  const context = { host: { platform: "linux", architecture: "x64" } };

  it("calls compileMany with every input in declared order, after the input steps", () => {
    compiledInputs.length = 0;
    const workflow = compileWorkflow(
      config({
        builds: [
          build("a"),
          build("b"),
          bundle([
            { buildId: "b", targetId: "windows-x64" },
            { buildId: "a", targetId: "windows-x64" },
          ]),
        ],
        destinations: archiveDestination("bundle", "zip"),
      }),
      multiRegistry,
      context,
    );
    expect(compiledInputs).toEqual([
      {
        producerId: "bundle",
        labels: ["b-windows-x64", "a-windows-x64"],
        refs: [
          { buildId: "b", targetId: "windows-x64" },
          { buildId: "a", targetId: "windows-x64" },
        ],
      },
    ]);
    const ids = workflow.steps.map((step) => step.id);
    expect(ids).toEqual(["source", "build-a", "build-b", "bundle-bundle", "archive-archive-main"]);
    expect(workflow.steps[3].needs).toEqual(expect.arrayContaining(["build-a", "build-b"]));
  });

  it("feeds a destination slot with the bundle output", () => {
    const workflow = compileWorkflow(
      config({
        builds: [
          build("a"),
          build("b"),
          bundle([
            { buildId: "a", targetId: "windows-x64" },
            { buildId: "b", targetId: "windows-x64" },
          ]),
        ],
        destinations: archiveDestination("bundle", "zip"),
      }),
      multiRegistry,
      context,
    );
    const archive = workflow.steps.find((step) => step.uses === "fake/archive");
    expect(archive?.artifactInputs?.folder).toEqual({
      stepId: "bundle-bundle",
      artifact: "output",
    });
    expect(archive?.needs).toContain("bundle-bundle");
  });

  it("compiles a bundle of a bundle, ordering the inner bundle first", () => {
    compiledInputs.length = 0;
    const workflow = compileWorkflow(
      config({
        builds: [
          build("a"),
          bundle([{ buildId: "a", targetId: "windows-x64" }], "inner"),
          bundle([{ buildId: "inner", targetId: "zip" }], "outer"),
        ],
        destinations: archiveDestination("outer", "zip"),
      }),
      multiRegistry,
      context,
    );
    expect(compiledInputs.map((entry) => entry.producerId)).toEqual(["inner", "outer"]);
    expect(compiledInputs[1]?.labels).toEqual(["inner-zip"]);
    const ids = workflow.steps.map((step) => step.id);
    expect(ids.indexOf("bundle-inner")).toBeLessThan(ids.indexOf("bundle-outer"));
  });

  it("fails clearly when a multi-input producer does not implement compileMany", () => {
    const { compileMany: _omitted, ...withoutCompileMany } = bundleProducer;
    expect(() =>
      compileWorkflow(
        config({
          builds: [build("a"), bundle([{ buildId: "a", targetId: "windows-x64" }])],
          destinations: archiveDestination("bundle", "zip"),
        }),
        { ...multiRegistry, producers: [perBuildProducer, withoutCompileMany] },
        context,
      ),
    ).toThrow(/compileMany/);
  });
});

describe("consumed targets: only outputs a destination or a consuming build reads are compiled", () => {
  const linuxDescriptor = {
    kind: "application" as const,
    platform: "linux",
    architecture: "x64",
    container: "directory" as const,
  };
  const packageDescriptor = {
    kind: "files" as const,
    container: "archive" as const,
    format: "zip",
  };
  const SOURCE: ReleaseOutputRef = { source: true };
  const out = (buildId: string, targetId: string): ReleaseOutputRef => ({ buildId, targetId });
  let compiled: Array<{ producerId: string; enabledTargets: string[] }> = [];

  const multiTargetProducer: ReleaseProducerDefinition = {
    id: "fake/multi",
    label: "Fake multi-target",
    planning: { mode: "build" },
    accepts: { kind: "project", technology: "fake" },
    targets: [
      {
        id: "windows-x64",
        label: "Windows",
        buildType: "desktop",
        output: appDescriptor,
        createDefaultConfig: () => ({}),
      },
      {
        id: "linux-x64",
        label: "Linux",
        buildType: "desktop",
        output: linuxDescriptor,
        createDefaultConfig: () => ({}),
      },
    ],
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: (input, producer) => {
      const enabledTargets = producer.targets.filter((target) => target.enabled).map((t) => t.id);
      compiled.push({ producerId: producer.id, enabledTargets });
      return {
        steps: enabledTargets.map((targetId) => ({
          id: `${producer.id}-${targetId}`,
          uses: "fake/multi-build",
          needs: [input.reference.stepId],
          artifactInputs: { input: input.reference },
          artifacts: { output: { descriptor: appDescriptor } },
        })),
        artifacts: Object.fromEntries(
          enabledTargets.map((targetId) => [
            targetId,
            {
              reference: { stepId: `${producer.id}-${targetId}`, artifact: "output" },
              descriptor: targetId === "windows-x64" ? appDescriptor : linuxDescriptor,
            },
          ]),
        ),
      };
    },
  };

  const packageProducer: ReleaseProducerDefinition = {
    id: "fake/package",
    label: "Fake package",
    planning: { mode: "build" },
    accepts: { kind: "application", platform: "windows" },
    targets: [
      {
        id: "pkg",
        label: "Package",
        buildType: "desktop",
        output: packageDescriptor,
        createDefaultConfig: () => ({}),
      },
    ],
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: (input, producer) => {
      compiled.push({
        producerId: producer.id,
        enabledTargets: producer.targets.filter((target) => target.enabled).map((t) => t.id),
      });
      return {
        steps: [
          {
            id: `${producer.id}-pkg`,
            uses: "fake/package-build",
            needs: [input.reference.stepId],
            artifactInputs: { input: input.reference },
            artifacts: { output: { descriptor: packageDescriptor } },
          },
        ],
        artifacts: {
          pkg: {
            reference: { stepId: `${producer.id}-pkg`, artifact: "output" },
            descriptor: packageDescriptor,
          },
        },
      };
    },
  };

  const bundleProducer: ReleaseProducerDefinition = {
    id: "fake/bundle",
    label: "Fake bundle",
    planning: { mode: "build" },
    inputs: "many",
    accepts: { kind: "application" },
    targets: [
      {
        id: "zip",
        label: "Zip",
        buildType: "bundle",
        output: packageDescriptor,
        createDefaultConfig: () => ({}),
      },
    ],
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: () => {
      throw new Error("multi-input producers compile through compileMany");
    },
    compileMany: (inputs, producer) => {
      compiled.push({
        producerId: producer.id,
        enabledTargets: producer.targets.filter((target) => target.enabled).map((t) => t.id),
      });
      return {
        steps: [
          {
            id: `${producer.id}-zip`,
            uses: "fake/bundle-build",
            artifactInputs: Object.fromEntries(
              inputs.map((input, index) => [`input${index}`, input.artifact.reference]),
            ),
            artifacts: { output: { descriptor: packageDescriptor } },
          },
        ],
        artifacts: {
          zip: {
            reference: { stepId: `${producer.id}-zip`, artifact: "output" },
            descriptor: packageDescriptor,
          },
        },
      };
    },
  };

  const deliverDestination: ReleaseDestinationDefinition = {
    id: "fake/deliver",
    label: "Fake deliver",
    accepts: {},
    createDefaultConfig: () => ({}),
    validate: () => [],
    compile: (artifact, destination, slot) => [
      {
        id: `deliver-${destination.id}-${slot.id}`,
        uses: "fake/deliver",
        needs: [artifact.reference.stepId],
        artifactInputs: { folder: artifact.reference },
      },
    ],
  };

  const consumptionRegistry: ReleaseRegistry = {
    ...registry,
    producers: [multiTargetProducer, packageProducer, bundleProducer],
    destinations: [deliverDestination],
  };

  const multi = (id: string, input: ReleaseConfig["builds"][number]["input"] = SOURCE) =>
    ({
      id,
      type: "desktop",
      engine: "fake/multi",
      enabled: true,
      input,
      config: {},
      targets: [
        { id: "windows-x64", enabled: true, config: {} },
        { id: "linux-x64", enabled: true, config: {} },
      ],
    }) as ReleaseConfig["builds"][number];
  const slotOf = (
    id: string,
    input: ReleaseConfig["destinations"][number]["slots"][number]["input"],
    enabled = true,
  ) => ({
    id,
    enabled,
    input,
    config: {},
  });
  const deliver = (
    id: string,
    slots: ReleaseConfig["destinations"][number]["slots"],
    enabled = true,
  ): ReleaseConfig["destinations"][number] => ({
    id,
    provider: "fake/deliver",
    enabled,
    config: {},
    slots,
  });
  const context = { host: { platform: "linux", architecture: "x64" } };
  const stepIds = (workflow: { readonly steps: readonly WorkflowStep[] }) =>
    workflow.steps.map((step) => step.id);
  const expectNoDanglingNeeds = (workflow: { readonly steps: readonly WorkflowStep[] }) => {
    const ids = new Set(workflow.steps.map((step) => step.id));
    for (const step of workflow.steps)
      for (const need of step.needs ?? []) expect(ids.has(need)).toBe(true);
  };

  it("compiles only the enabled targets that a destination slot reads", () => {
    compiled = [];
    const workflow = compileWorkflow(
      config({
        builds: [multi("a")],
        destinations: [deliver("ship", [slotOf("windows", out("a", "windows-x64"))])],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([{ producerId: "a", enabledTargets: ["windows-x64"] }]);
    expect(stepIds(workflow)).toEqual(["source", "a-windows-x64", "deliver-ship-windows"]);
    expectNoDanglingNeeds(workflow);
  });

  it("emits no steps for a build whose targets nothing consumes, and keeps the source", () => {
    compiled = [];
    const workflow = compileWorkflow(
      config({ builds: [multi("a")], destinations: [] }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([]);
    expect(stepIds(workflow)).toEqual(["source"]);
  });

  it("does not compile an unconsumed build alongside a consumed one, and leaves no dangling needs", () => {
    compiled = [];
    const workflow = compileWorkflow(
      config({
        builds: [multi("a"), multi("b")],
        destinations: [deliver("ship", [slotOf("windows", out("a", "windows-x64"))])],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled.map((entry) => entry.producerId)).toEqual(["a"]);
    expect(stepIds(workflow).some((id) => id.startsWith("b-"))).toBe(false);
    expectNoDanglingNeeds(workflow);
  });

  it("ignores a disabled slot when deciding which targets are consumed", () => {
    compiled = [];
    compileWorkflow(
      config({
        builds: [multi("a")],
        destinations: [
          deliver("ship", [
            slotOf("windows", out("a", "windows-x64"), false),
            slotOf("linux", out("a", "linux-x64")),
          ]),
        ],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([{ producerId: "a", enabledTargets: ["linux-x64"] }]);
  });

  it("ignores a disabled destination when deciding which targets are consumed", () => {
    compiled = [];
    compileWorkflow(
      config({
        builds: [multi("a")],
        destinations: [
          deliver("archived", [slotOf("windows", out("a", "windows-x64"))], false),
          deliver("ship", [slotOf("linux", out("a", "linux-x64"))]),
        ],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([{ producerId: "a", enabledTargets: ["linux-x64"] }]);
  });

  it("consumes the targets a bundle lists as inputs", () => {
    compiled = [];
    const workflow = compileWorkflow(
      config({
        builds: [
          multi("a"),
          {
            id: "bundle",
            type: "bundle",
            engine: "fake/bundle",
            enabled: true,
            inputs: [out("a", "windows-x64")],
            config: {},
            targets: [{ id: "zip", enabled: true, config: {} }],
          },
        ],
        destinations: [deliver("ship", [slotOf("zip", out("bundle", "zip"))])],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([
      { producerId: "a", enabledTargets: ["windows-x64"] },
      { producerId: "bundle", enabledTargets: ["zip"] },
    ]);
    expect(stepIds(workflow)).toEqual([
      "source",
      "a-windows-x64",
      "bundle-zip",
      "deliver-ship-zip",
    ]);
    expectNoDanglingNeeds(workflow);
  });

  it("consumes the upstream target an implicit-input build resolved to", () => {
    compiled = [];
    const workflow = compileWorkflow(
      config({
        builds: [
          multi("a"),
          {
            id: "pkg",
            type: "desktop",
            engine: "fake/package",
            enabled: true,
            config: {},
            targets: [{ id: "pkg", enabled: true, config: {} }],
          },
        ],
        destinations: [deliver("ship", [slotOf("pkg", out("pkg", "pkg"))])],
      }),
      consumptionRegistry,
      context,
    );
    expect(compiled).toEqual([
      { producerId: "a", enabledTargets: ["windows-x64"] },
      { producerId: "pkg", enabledTargets: ["pkg"] },
    ]);
    expect(stepIds(workflow)).toEqual(["source", "a-windows-x64", "pkg-pkg", "deliver-ship-pkg"]);
    expectNoDanglingNeeds(workflow);
  });

  it("is idempotent and does not change the configuration it compiles", () => {
    const configuration = config({
      builds: [multi("a"), multi("b")],
      destinations: [deliver("ship", [slotOf("windows", out("a", "windows-x64"))])],
    });
    const before = structuredClone(configuration);
    const first = compileWorkflow(configuration, consumptionRegistry, context);
    const second = compileWorkflow(configuration, consumptionRegistry, context);
    expect(second).toEqual(first);
    expect(configuration).toEqual(before);
  });
});
