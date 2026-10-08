import type { BuildHistoryEntry, Events } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import { applyWorkflowEventToRunEntry, reconcileRunEntry } from "./run-detail-state";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

const entry = (): BuildHistoryEntry => ({
  id: "run-1",
  projectId: "project-1",
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
        outputs: { package: { path: "/tmp/package.zip" } },
        artifacts: [{ name: "package.zip", path: "/tmp/package.zip" }],
        deliveries: [
          {
            id: "delivery-1",
            destinationId: "filesystem",
            slotId: "release",
            artifactId: "workflow-artifact-0",
            status: "completed",
            startedAt: 5,
            completedAt: 8,
            duration: 3,
          },
        ],
        steps: {
          build: {
            id: "build",
            uses: "fake.build",
            status: "completed",
            outputs: { package: "/tmp/package.zip" },
            artifacts: [],
            startedAt: 2,
            completedAt: 8,
            duration: 6,
          },
        },
      },
      duration: 9,
      timestamp: 10,
    });

    expect(run).toMatchObject({
      status: "completed",
      endTime: 10,
      duration: 9,
      output: { package: { path: "/tmp/package.zip" } },
      completedSteps: 1,
      failedSteps: 0,
      cancelledSteps: 0,
    });
    expect(run.artifacts).toHaveLength(1);
    expect(run.deliveries).toHaveLength(1);
    expect(run.steps[0]).toMatchObject({ id: "build", status: "completed", duration: 6 });
  });
});

describe("reconcileRunEntry", () => {
  it("refreshes persisted state while retaining unique live logs", () => {
    const live = entry();
    applyWorkflowEventToRunEntry(live, {
      type: "step.log",
      stepId: "build",
      stream: "stdout",
      message: "live output",
      timestamp: 10,
    });
    const persisted = entry();
    persisted.steps[0].status = "completed";
    persisted.steps[0].logs.push({
      id: "persisted",
      timestamp: 10,
      level: "info",
      message: "live output",
      source: "build",
    });
    persisted.artifacts = [
      { id: "artifact", name: "bundle", path: "/tmp/bundle", size: 1, type: "file" },
    ];

    const merged = reconcileRunEntry(live, persisted);

    expect(merged.steps[0].status).toBe("completed");
    expect(merged.steps[0].logs).toHaveLength(1);
    expect(merged.logs.map((log) => log.message)).toEqual(["live output"]);
    expect(merged.artifacts).toEqual(persisted.artifacts);
  });

  it("does not regress a locally observed terminal status to persisted running", () => {
    const live = entry();
    live.status = "failed";
    live.error = { message: "failed", code: "FAILED", timestamp: 10 };

    const merged = reconcileRunEntry(live, entry());

    expect(merged.status).toBe("failed");
    expect(merged.error?.message).toBe("failed");
  });
});
