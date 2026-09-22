import { describe, expect, it } from "vitest";
import type { WorkflowEvent } from "@pipelab/workflow-runtime";
import { applyWorkflowEventToHistory } from "./handlers/workflow";

describe("workflow history event projection", () => {
  it("persists live step logs and status changes", () => {
    const steps = [
      {
        id: "build",
        name: "build",
        status: "pending" as const,
        startTime: 0,
        logs: [],
      },
    ];
    const logs: (typeof steps)[number]["logs"] = [];

    applyWorkflowEventToHistory(steps, logs, {
      type: "step.started",
      stepId: "build",
      uses: "fake/build",
      timestamp: 10,
    } as WorkflowEvent);
    applyWorkflowEventToHistory(steps, logs, {
      type: "step.log",
      stepId: "build",
      stream: "stdout",
      message: "Building project",
      timestamp: 20,
    } as WorkflowEvent);

    expect(steps[0]).toMatchObject({ status: "running", startTime: 10 });
    expect(steps[0].logs).toHaveLength(1);
    expect(steps[0].logs[0]).toMatchObject({
      message: "Building project",
      source: "build",
      level: "info",
    });
    expect(logs).toEqual(steps[0].logs);
  });
});
