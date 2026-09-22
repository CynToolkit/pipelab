import type { BuildHistoryEntry, Events } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import { applyWorkflowEventToRunEntry } from "./run-detail-state";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

const entry = (): BuildHistoryEntry => ({
  id: "run-1",
  pipelineId: "project-1",
  workflowId: "flow-1",
  projectName: "Project",
  projectPath: "",
  status: "running",
  startTime: 1,
  steps: [
    {
      id: "build",
      name: "Build",
      status: "pending",
      startTime: 0,
      logs: [],
    },
  ],
  totalSteps: 1,
  completedSteps: 0,
  failedSteps: 0,
  cancelledSteps: 0,
  logs: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("applyWorkflowEventToRunEntry", () => {
  it("adds streamed logs to the matching step and run", () => {
    const run = entry();
    const event: WorkflowEvent = {
      type: "step.log",
      stepId: "build",
      stream: "stdout",
      message: "built",
      timestamp: 10,
    };

    applyWorkflowEventToRunEntry(run, event);

    expect(run.steps[0].logs[0]).toMatchObject({ message: "built", source: "build" });
    expect(run.logs).toEqual(run.steps[0].logs);
  });

  it("updates the run status from the workflow terminal event", () => {
    const run = entry();

    applyWorkflowEventToRunEntry(run, {
      type: "workflow.completed",
      result: {
        status: "completed",
        outputs: {},
        artifacts: [],
        deliveries: [],
        steps: {},
      },
      duration: 9,
      timestamp: 10,
    });

    expect(run).toMatchObject({ status: "completed", endTime: 10, duration: 9 });
  });
});
