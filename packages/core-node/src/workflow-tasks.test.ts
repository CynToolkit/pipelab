import { describe, expect, it, vi } from "vitest";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import {
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

describe("workflow plugin task registry", () => {
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
