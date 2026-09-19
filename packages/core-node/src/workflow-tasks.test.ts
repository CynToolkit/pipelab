import { describe, expect, it, vi } from "vitest";
import { createWorkflowActionTask, createPipelabWorkflowTasks } from "./workflow-tasks";

describe("workflow plugin task adapter", () => {
  it("adapts a plugin runner and declared artifact output", async () => {
    const setArtifact = vi.fn();
    const task = createWorkflowActionTask(async ({ setOutput }) => { setOutput("output", "/tmp/build"); }, { context: {} as never, paths: {} as never });
    await task({ step: { id: "build", uses: "fake/build", artifacts: { output: { descriptor: { kind: "application", container: "directory" } } } }, inputs: {}, workspace: { root: "/tmp" }, filesystem: { ensureDirectory: async () => undefined }, processes: {} as never, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, signal: new AbortController().signal, log: vi.fn(), logStream: vi.fn(), setArtifact } as never);
    expect(setArtifact).toHaveBeenCalledWith("output", "/tmp/build");
  });

  it("exposes loaded plugin nodes under stable plugin-qualified task IDs", () => {
    const tasks = createPipelabWorkflowTasks({ context: {} as never, paths: {} as never }, [{ id: "@example/plugin", nodes: [{ node: { id: "build" }, runner: vi.fn() }] }]);
    expect(tasks["@example/plugin/build"]).toBeTypeOf("function");
  });
});
