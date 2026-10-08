import type { BuildHistoryEntry, Events } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import { applyWorkflowEventToRunEntry, buildRunFailureDiagnostics } from "./run-detail-state";

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

describe("buildRunFailureDiagnostics", () => {
  it("explains a failed destination step and keeps the provider detail", () => {
    const run = entry();
    run.status = "completed-with-errors";
    run.completedSteps = 1;
    run.steps[0] = {
      ...run.steps[0],
      name: "Upload to Steam",
      status: "failed",
      destinationId: "steam",
      slotId: "windows",
      error: {
        message: "Steam authentication failed. Run pipelab login steam and try again.",
        code: "ExternalCommandError",
        timestamp: 20,
      },
    };
    run.deliveries = [
      {
        id: "build",
        destinationId: "steam",
        destinationName: "Steam",
        slotId: "windows",
        artifactId: "package",
        status: "failed",
        startedAt: 10,
        completedAt: 20,
        duration: 10,
        error: "Steam authentication failed. Run pipelab login steam and try again.",
      },
    ];

    expect(buildRunFailureDiagnostics(run)).toEqual([
      expect.objectContaining({
        title: "Upload to Steam",
        destination: "Steam",
        slotId: "windows",
        category: "Authentication",
        nextAction: expect.stringContaining("pipelab login steam"),
        rawMessage: "Steam authentication failed. Run pipelab login steam and try again.",
        errorCode: "ExternalCommandError",
      }),
    ]);
  });

  it("suggests checking installation for a run setup command that is missing", () => {
    const run = entry();
    run.status = "failed";
    run.error = {
      message: "spawn pnpm ENOENT",
      code: "Error",
      stack: "Error: spawn pnpm ENOENT\n    at setupRuntime",
      timestamp: 20,
    };

    expect(buildRunFailureDiagnostics(run)[0]).toMatchObject({
      title: "Run setup",
      category: "Missing tool or file",
      nextAction: expect.stringMatching(/install|path/i),
      rawMessage: "spawn pnpm ENOENT",
      rawStack: "Error: spawn pnpm ENOENT\n    at setupRuntime",
    });
  });

  it("does not show failure diagnostics for a successful or active run", () => {
    expect(buildRunFailureDiagnostics(entry())).toEqual([]);
    const completed = entry();
    completed.status = "completed";
    expect(buildRunFailureDiagnostics(completed)).toEqual([]);
  });
});
