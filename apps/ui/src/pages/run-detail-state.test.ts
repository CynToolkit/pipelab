import type { BuildHistoryEntry, Events } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import {
  applyWorkflowEventToRunEntry,
  buildRunFailureDiagnostics,
  reconcileRunEntry,
  runFailureArtifactSummary,
} from "./run-detail-state";

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

describe("runFailureArtifactSummary", () => {
  it("directs users to recorded artifacts and stays accurate when none were recorded", () => {
    const run = entry();

    expect(runFailureArtifactSummary(run)).toBe("No artifacts were recorded for this run.");

    run.artifacts = [
      { id: "package", name: "package.zip", path: "/tmp/package.zip", size: 1, type: "file" },
    ];
    expect(runFailureArtifactSummary(run)).toBe("1 artifact available in the Artifacts tab.");
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

  it.each(["completed", "failed", "skipped", "cancelled"] as const)(
    "keeps a newer live %s step when delayed history is pending",
    (status) => {
      const live = entry();
      live.steps[0] = {
        ...live.steps[0],
        status,
        endTime: 20,
        ...(status === "failed"
          ? { error: { message: "live failure", code: "FAILED", timestamp: 20 } }
          : {}),
      };
      const persisted = entry();
      persisted.steps[0] = { ...persisted.steps[0], status: "pending" };

      const merged = reconcileRunEntry(live, persisted);

      expect(merged.steps[0].status).toBe(status);
      expect(merged.steps[0].endTime).toBe(20);
      if (status === "failed") expect(merged.steps[0].error?.message).toBe("live failure");
    },
  );

  it("retains a newer live step error over an older persisted running step", () => {
    const live = entry();
    live.steps[0] = {
      ...live.steps[0],
      status: "failed",
      endTime: 30,
      error: { message: "new failure", code: "FAILED", timestamp: 30 },
    };
    const persisted = entry();
    persisted.steps[0] = { ...persisted.steps[0], status: "running", startTime: 10 };

    const merged = reconcileRunEntry(live, persisted);

    expect(merged.steps[0]).toMatchObject({
      status: "failed",
      endTime: 30,
      error: { message: "new failure", timestamp: 30 },
    });
  });

  it("deduplicates one persisted copy of a live log", () => {
    const live = entry();
    live.logs = [{ id: "live", timestamp: 10, level: "info", message: "same", source: "build" }];
    const persisted = entry();
    persisted.logs = [
      { id: "stored", timestamp: 10, level: "info", message: "same", source: "build" },
    ];

    expect(reconcileRunEntry(live, persisted).logs).toHaveLength(1);
  });

  it("preserves genuine identical repeated log lines", () => {
    const repeatedLog = (id: string) => ({
      id,
      timestamp: 10,
      level: "info" as const,
      message: "same",
      source: "build",
    });
    const live = entry();
    live.logs = [repeatedLog("live-1"), repeatedLog("live-2")];
    live.steps[0].logs = [repeatedLog("live-step-1"), repeatedLog("live-step-2")];
    const persisted = entry();
    persisted.logs = [repeatedLog("stored-1"), repeatedLog("stored-2")];
    persisted.steps[0].logs = [repeatedLog("stored-step-1"), repeatedLog("stored-step-2")];

    const merged = reconcileRunEntry(live, persisted);

    expect(merged.logs).toHaveLength(2);
    expect(merged.steps[0].logs).toHaveLength(2);
  });
});
