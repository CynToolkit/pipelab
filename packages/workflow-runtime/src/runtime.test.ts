import { describe, expect, it } from "vitest";
import { runWorkflow, type WorkflowHost } from "./index";

const host: WorkflowHost = {
  workspace: { root: "/tmp" },
  filesystem: { ensureDirectory: async () => undefined },
  processes: { execute: async () => ({ exitCode: 0, stdout: "", stderr: "", duration: 0 }) },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
};

describe("artifact-aware workflow runtime", () => {
  it("materializes declared artifact descriptors without a global registry", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: {
            output: {
              descriptor: { kind: "application", platform: "windows", container: "directory" },
            },
          },
        },
        {
          id: "deliver",
          uses: "test:deliver",
          needs: ["build"],
          delivery: {
            destinationId: "folder",
            slotId: "windows",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    } as const;
    let deliveredPath = "";
    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => {
          setArtifact("output", "/tmp/game");
        },
        "test:deliver": async ({ delivery }) => {
          deliveredPath = delivery!.artifact.path;
        },
      },
    });
    expect(deliveredPath).toBe("/tmp/game");
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        descriptor: { kind: "application", platform: "windows", container: "directory" },
        stepId: "build",
        artifact: "output",
        path: "/tmp/game",
      }),
    ]);
  });

  it("resolves artifact inputs to runtime paths before executing a task", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: {
            output: {
              descriptor: { kind: "application", platform: "web", container: "directory" },
            },
          },
        },
        {
          id: "ship",
          uses: "test:ship",
          needs: ["build"],
          artifactInputs: { "input-folder": { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    let inputs: Record<string, unknown> | undefined;
    await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/workspace/web-build"),
        "test:ship": async (context) => {
          inputs = context.inputs;
        },
      },
    });
    expect(inputs).toEqual({ "input-folder": "/workspace/web-build" });
  });

  it("allows one produced artifact to serve multiple consumers", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "ship-a",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
        {
          id: "ship-b",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    const paths: string[] = [];
    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/workspace/site"),
        "test:ship": async ({ inputs }) => {
          paths.push(inputs.input as string);
        },
      },
    });
    expect(paths).toEqual(["/workspace/site", "/workspace/site"]);
    expect(result.artifacts).toHaveLength(1);
  });

  it("fails clearly when an artifact was declared but not produced", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "ship",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    await expect(
      runWorkflow(workflow, {
        host,
        tasks: { "test:build": async () => undefined, "test:ship": async () => undefined },
      }),
    ).rejects.toThrow(
      'requires artifact "output" from step "build", but that artifact was not produced',
    );
  });

  it("fails before execution when an artifact input names an undeclared artifact", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "build",
              uses: "test:build",
              artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
            },
            {
              id: "ship",
              uses: "test:ship",
              artifactInputs: { input: { stepId: "build", artifact: "missing" } },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow('references undeclared artifact "missing" on workflow step "build"');
  });

  it("fails before execution when delivery names an undeclared artifact", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "build",
              uses: "test:build",
              artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
            },
            {
              id: "ship",
              uses: "test:ship",
              delivery: {
                destinationId: "folder",
                slotId: "slot",
                artifact: { stepId: "build", artifact: "missing" },
              },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow('references undeclared artifact "missing" on workflow step "build"');
  });

  it("fails before execution when delivery names an unknown step", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "ship",
              uses: "test:ship",
              delivery: {
                destinationId: "folder",
                slotId: "slot",
                artifact: { stepId: "missing", artifact: "output" },
              },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow("references an unknown artifact step: missing");
  });
});
