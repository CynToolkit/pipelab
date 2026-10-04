import { describe, expect, it, vi } from "vitest";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import {
  createWorkflowActionTask,
  createPipelabWorkflowTasks,
  createWorkflowTaskRegistry,
  type PipelabPluginServices,
} from "./workflow-tasks";
import { workflowTaskFactories } from "./workflow-tasks/registry";
import { PipelabContext } from "./context";

const services: PipelabPluginServices = {
  context: new PipelabContext({ userDataPath: "/tmp/pipelab-workflow-task-test" }),
  executables: { node: "/node", pnpm: "/pnpm" },
  workflowCachePath: "/cache/workflow",
};

describe("workflow plugin task adapter", () => {
  it("adapts a plugin runner and declared artifact output", async () => {
    const setArtifact = vi.fn();
    const task = createWorkflowActionTask(
      async ({ setOutput }) => {
        setOutput("output", "/tmp/build");
      },
      { context: {} as never, paths: {} as never },
    );
    await task({
      step: {
        id: "build",
        uses: "fake/build",
        artifacts: { output: { descriptor: { kind: "application", container: "directory" } } },
      },
      inputs: {},
      workspace: { root: "/tmp" },
      filesystem: { ensureDirectory: async () => undefined },
      processes: {} as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      signal: new AbortController().signal,
      log: vi.fn(),
      logStream: vi.fn(),
      setArtifact,
    } as never);
    expect(setArtifact).toHaveBeenCalledWith("output", "/tmp/build");
  });

  it("registers explicit plugin runners under their stable task IDs", () => {
    const task = vi.fn(async () => ({ ready: true }));
    const tasks = createPipelabWorkflowTasks(services, { "@example/plugin/build": task });

    expect(tasks["@example/plugin/build"]).toBeTypeOf("function");
  });

  it("registers every task ID emitted by the built-in Release providers", () => {
    const tasks = createPipelabWorkflowTasks(
      services,
      createWorkflowTaskRegistry(workflowTaskFactories, services),
    );

    for (const uses of [
      "@pipelab/plugin-construct/export-construct-project",
      "@pipelab/plugin-electron/electron:package:v2",
      "@pipelab/plugin-godot/godot:export",
      "@pipelab/plugin-itch/itch-upload",
      "@pipelab/plugin-poki/poki-upload",
      "@pipelab/plugin-steam/steam-upload",
      "@pipelab/plugin-tauri/tauri:package:v2",
      ...Object.values(CORE_WORKFLOW_TASKS),
      "pipelab-cloud:upload",
    ]) {
      expect(tasks[uses], `${uses} must resolve to a workflow task`).toBeTypeOf("function");
    }
  });
});
