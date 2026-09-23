import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBuildHistoryDocument, type BuildHistoryEntry } from "@pipelab/shared";
import {
  runWorkflow,
  type WorkflowEvent,
  type WorkflowHost,
  type WorkflowResult,
  type WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import { applyWorkflowEventToHistory } from "./handlers/workflow";
import { BuildHistoryStorage } from "./handlers/build-history";
import { PipelabContext } from "./context";

const host: WorkflowHost = {
  workspace: { root: "/tmp" },
  filesystem: { ensureDirectory: async () => undefined },
  processes: { execute: async () => ({ exitCode: 0, stdout: "", stderr: "", duration: 0 }) },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
};

const parseRuntimeHistory = (id: string, result: WorkflowResult): BuildHistoryEntry => {
  const entry = parseBuildHistoryDocument({
    version: "1.0.0",
    entries: [
      {
        id,
        pipelineId: "main",
        workflowId: "release",
        workflowName: "Release",
        projectName: "Game",
        status: result.status,
        startTime: 1,
        totalSteps: Object.keys(result.steps).length,
        completedSteps: Object.values(result.steps).filter((step) => step.status === "completed")
          .length,
        failedSteps: Object.values(result.steps).filter(
          (step) => step.status === "failed" || step.status === "skipped",
        ).length,
        cancelledSteps: 0,
        steps: Object.values(result.steps).map((step) => ({
          id: step.id,
          name: step.id,
          uses: step.uses,
          status: step.status,
          startTime: step.startedAt,
          endTime: step.completedAt,
          duration: step.duration,
          logs: [],
          ...(step.error
            ? { error: { message: step.error.message, timestamp: step.completedAt } }
            : {}),
          ...(step.delivery
            ? { destinationId: step.delivery.destinationId, slotId: step.delivery.slotId }
            : {}),
        })),
        logs: [],
        artifacts: result.artifacts,
        deliveries: result.deliveries,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  }).entries[0];
  if (!entry) throw new Error("Expected the runtime result to produce a history entry");
  return entry;
};

const releaseWorkflow = {
  version: 1,
  continueOnError: true,
  steps: [
    {
      id: "build",
      uses: "test:build",
      artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
    },
    {
      id: "deliver",
      uses: "test:deliver",
      needs: ["build"],
      delivery: {
        destinationId: "folder",
        slotId: "main",
        artifact: { stepId: "build", artifact: "output" },
      },
    },
  ],
} as const;

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

  it("keeps successful runtime deliveries compatible with strict build history", async () => {
    const result = await runWorkflow(releaseWorkflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/tmp/game"),
        "test:deliver": async () => ({ delivered: true }),
      },
    });

    const history = parseRuntimeHistory("run-success", result);
    expect(history?.deliveries).toEqual(result.deliveries);
    expect(history?.deliveries?.[0]?.artifactId).toBeTruthy();
  });

  it("keeps failed runtime deliveries compatible with strict build history", async () => {
    const result = await runWorkflow(releaseWorkflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/tmp/game"),
        "test:deliver": async () => {
          throw new Error("upload failed");
        },
      },
    });

    const history = parseRuntimeHistory("run-failed-delivery", result);
    expect(history?.deliveries).toEqual(result.deliveries);
    expect(history?.deliveries?.[0]).toMatchObject({
      status: "failed",
      artifactId: expect.any(String),
    });
  });

  it("keeps skipped runtime deliveries out of strict build history", async () => {
    const result = await runWorkflow(releaseWorkflow, {
      host,
      tasks: {
        "test:build": async () => {
          throw new Error("build failed");
        },
        "test:deliver": async () => ({ delivered: true }),
      },
    });

    const history = parseRuntimeHistory("run-skipped-delivery", result);
    expect(result.steps.deliver).toMatchObject({ status: "skipped", blockedBy: ["build"] });
    expect(history?.deliveries).toEqual([]);
  });

  it("reloads successful, failed, and skipped workflow results from BuildHistory storage", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "pipelab-workflow-history-"));
    try {
      const context = new PipelabContext({ userDataPath });
      const storage = new BuildHistoryStorage(context);
      const cases: Array<{ id: string; tasks: WorkflowTaskRegistry }> = [
        {
          id: "run-success",
          tasks: {
            "test:build": async ({ setArtifact }) => setArtifact("output", "/tmp/game"),
            "test:deliver": async () => ({ delivered: true }),
          },
        },
        {
          id: "run-failed-delivery",
          tasks: {
            "test:build": async ({ setArtifact }) => setArtifact("output", "/tmp/game"),
            "test:deliver": async () => {
              throw new Error("upload failed");
            },
          },
        },
        {
          id: "run-skipped-delivery",
          tasks: {
            "test:build": async () => {
              throw new Error("build failed");
            },
            "test:deliver": async () => ({ delivered: true }),
          },
        },
      ];

      for (const scenario of cases) {
        const result = await runWorkflow(releaseWorkflow, { host, tasks: scenario.tasks });
        await storage.save(parseRuntimeHistory(scenario.id, result));
      }

      const reloadedStorage = new BuildHistoryStorage(context);
      const successful = await reloadedStorage.get("run-success", "main");
      const failed = await reloadedStorage.get("run-failed-delivery", "main");
      const skipped = await reloadedStorage.get("run-skipped-delivery", "main");

      expect(successful?.deliveries?.[0]).toMatchObject({
        status: "completed",
        artifactId: expect.any(String),
      });
      expect(failed?.deliveries?.[0]).toMatchObject({
        status: "failed",
        artifactId: expect.any(String),
      });
      expect(failed?.steps.map((step) => step.status)).toContain("failed");
      expect(skipped?.deliveries).toEqual([]);
      expect(skipped?.steps.map((step) => step.status)).toContain("skipped");
    } finally {
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});
