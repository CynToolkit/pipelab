import { describe, expect, it } from "vitest";
import { compileReleasePlan, compileWorkflow } from "./compiler";
import { planRelease } from "./planner";
import type { ReleaseConfig, ReleaseRegistry } from "./types";
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
        config({ destinations: [] }),
        { ...registry, producers: [mismatched] },
        { host: { platform: "linux", architecture: "x64" } },
      ),
    ).not.toThrow();
    expect(() =>
      compileWorkflow(
        config({ destinations: [] }),
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
      targets: [],
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
      destinations: [],
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
        destinations: [],
      },
      transformed,
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(workflow.steps.map((step) => step.uses)).toEqual(["zip/source", "extract", "engine"]);
  });
});
