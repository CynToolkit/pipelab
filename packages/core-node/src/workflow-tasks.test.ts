import { describe, expect, it, vi } from "vitest";
import type { WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { PipelabContext } from "./context";
import type { ActionRunner } from "./types/runner";
import { createWorkflowActionTask } from "./workflow-tasks";

const makeTaskContext = (): WorkflowTaskContext => ({
  step: { id: "test", uses: "test:action" },
  inputs: { source: "/tmp/source" },
  workspace: { root: "/tmp/workflow" },
  filesystem: { ensureDirectory: vi.fn(async () => undefined) },
  processes: { execute: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  signal: new AbortController().signal,
  log: vi.fn(),
  logStream: vi.fn(),
  setArtifact: vi.fn(),
});

describe("createWorkflowActionTask", () => {
  it("adapts action outputs, logs, artifacts, and cancellation", async () => {
    const actionRunner: ActionRunner<any> = async (options) => {
      options.log("export started");
      options.setOutput("zipFile", "/tmp/workflow/export");
      options.setArtifact("export", "/tmp/workflow/export");
      expect(options.abortSignal.aborted).toBe(false);
      expect(options.inputs).toEqual({ source: "/tmp/source" });
    };
    const taskContext = makeTaskContext();
    const task = createWorkflowActionTask(actionRunner, {
      context: new PipelabContext({ userDataPath: "/tmp/pipelab-user-data" }),
      paths: {
        cache: "/tmp/cache",
        pnpm: "/tmp/pnpm",
        node: "/tmp/node",
        userData: "/tmp/pipelab-user-data",
        modules: "",
        thirdparty: "/tmp/thirdparty",
      },
      outputAliases: { outputDirectory: "zipFile" },
    });

    await expect(task(taskContext)).resolves.toEqual({
      zipFile: "/tmp/workflow/export",
      outputDirectory: "/tmp/workflow/export",
    });
    expect(taskContext.log).toHaveBeenCalledWith("export started");
    expect(taskContext.setArtifact).toHaveBeenCalledWith("export", "/tmp/workflow/export");
  });
});
