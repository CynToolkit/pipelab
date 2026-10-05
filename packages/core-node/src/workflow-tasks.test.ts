import { describe, expect, it, vi } from "vitest";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import {
  createPipelabWorkflowTasks,
  createWorkflowTaskRegistry,
  type ProviderServices,
} from "./workflow-tasks";
import {
  createBuiltInWorkflowTaskFactories,
  workflowTaskFactories,
} from "./workflow-tasks/registry";
import { builtInProviders } from "./providers-registry";
import { PipelabContext } from "./context";

const services: ProviderServices = {
  context: new PipelabContext({ userDataPath: "/tmp/pipelab-workflow-task-test" }),
  executables: { node: "/node", pnpm: "/pnpm" },
  workflowCachePath: "/cache/workflow",
};

describe("workflow plugin task registry", () => {
  it("registers plugin tasks under their stable task IDs", () => {
    const task = vi.fn(async () => ({ ready: true }));
    const tasks = createPipelabWorkflowTasks(services, { "@example/plugin/build": task });

    expect(tasks["@example/plugin/build"]).toBeTypeOf("function");
  });

  it("registers every built-in and core workflow task", () => {
    const tasks = createPipelabWorkflowTasks(
      services,
      createWorkflowTaskRegistry(workflowTaskFactories, services),
    );

    for (const uses of [
      ...Object.keys(workflowTaskFactories),
      ...Object.values(CORE_WORKFLOW_TASKS),
      "pipelab-cloud:upload",
    ]) {
      expect(tasks[uses], `${uses} must resolve to a workflow task`).toBeTypeOf("function");
    }
  });

  it("fails loudly when built-in providers have duplicate IDs", () => {
    expect(() =>
      createBuiltInWorkflowTaskFactories([builtInProviders[0]!, builtInProviders[0]!]),
    ).toThrow("Duplicate provider ID:");
  });

  it("fails loudly when built-in providers have duplicate task IDs", () => {
    const [first, second, ...rest] = builtInProviders;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const duplicateTaskProvider = { ...second!, workflowTasks: first!.workflowTasks };

    expect(() =>
      createBuiltInWorkflowTaskFactories([first!, duplicateTaskProvider, ...rest]),
    ).toThrow("Duplicate workflow task ID:");
  });
});
