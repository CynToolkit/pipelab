import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PipelabContext } from "../context";
import { BuildHistoryStorage } from "./build-history";
import { filterBuildHistoryEntries } from "./history";

const workspaces: string[] = [];
const entry = (id: string, workflowId: string, startTime: number) => ({
  id,
  pipelineId: "project-1",
  workflowId,
  workflowName: "Release",
  projectName: "Release",
  projectPath: "/game",
  status: "running" as const,
  startTime,
  steps: [],
  totalSteps: 1,
  completedSteps: 0,
  failedSteps: 0,
  cancelledSteps: 0,
  logs: [],
  artifacts: [],
  deliveries: [],
  createdAt: startTime,
  updatedAt: startTime,
});

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("BuildHistoryStorage workflow runs", () => {
  it("marks persisted running entries interrupted during startup recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    await storage.save({
      ...entry("run-active", "workflow-a", 10),
      steps: [
        {
          id: "done",
          name: "Prepare project files",
          status: "completed",
          startTime: 11,
          endTime: 20,
          duration: 9,
          logs: [],
        },
        {
          id: "running",
          name: "Electron · Windows x64",
          status: "running",
          startTime: 21,
          logs: [],
        },
        { id: "pending", name: "Steam · Windows x64", status: "pending", startTime: 10, logs: [] },
      ],
    });
    await storage.save({ ...entry("run-done", "workflow-a", 5), status: "completed" });

    await storage.reconcileInterruptedRuns(50);

    const recovered = await storage.get("run-active", "project-1");
    expect(recovered).toMatchObject({
      status: "failed",
      endTime: 50,
      duration: 40,
      error: { code: "INTERRUPTED" },
      steps: [
        { id: "done", status: "completed" },
        { id: "running", status: "failed", error: { code: "INTERRUPTED" } },
        { id: "pending", status: "cancelled" },
      ],
    });
    expect((await storage.get("run-done", "project-1"))?.status).toBe("completed");
  });

  it("creates, updates, lists by workflow and retrieves persisted run details", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    await storage.save(entry("run-1", "workflow-a", 10));
    await storage.save(entry("run-2", "workflow-b", 20));
    await storage.update(
      "run-1",
      {
        status: "completed",
        endTime: 30,
        duration: 20,
        completedSteps: 1,
        steps: [
          {
            id: "package",
            name: "package",
            status: "completed",
            startTime: 12,
            endTime: 30,
            duration: 18,
            logs: [
              { id: "log-1", timestamp: 20, level: "info", message: "packed", source: "package" },
            ],
            output: { file: "/game.zip" },
          },
        ],
        artifacts: [
          {
            id: "artifact-1",
            descriptor: {
              kind: "files",
              platform: "windows",
              architecture: "x64",
              container: "archive",
              format: "zip",
            },
            version: "1.0.0",
            path: "/game.zip",
            stepId: "package",
            artifact: "output",
            size: 1,
            type: "file",
          },
        ],
        deliveries: [
          {
            id: "delivery-1",
            destinationId: "steam",
            slotId: "windows",
            artifactId: "artifact-1",
            status: "completed",
            startedAt: 25,
            completedAt: 30,
            duration: 5,
          },
        ],
      },
      "project-1",
    );

    expect((await storage.get("run-1"))?.status).toBe("completed");
    expect((await storage.get("run-1"))?.steps[0].logs[0].message).toBe("packed");
    expect((await storage.getByPipeline("project-1")).map((item) => item.id)).toEqual([
      "run-2",
      "run-1",
    ]);
    expect(
      filterBuildHistoryEntries(await storage.getAll(), { workflowId: "workflow-a" }).map(
        (item) => item.id,
      ),
    ).toEqual(["run-1"]);
  });

  it("retains failed run status and error details", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    await storage.save(entry("run-failed", "workflow-a", 10));
    await storage.update(
      "run-failed",
      {
        status: "failed",
        endTime: 15,
        duration: 5,
        error: { message: "publish failed", timestamp: 15 },
      },
      "project-1",
    );

    expect(await storage.get("run-failed")).toMatchObject({
      status: "failed",
      duration: 5,
      error: { message: "publish failed" },
    });
  });

  it("does not report a corrupt history document as a missing run", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    const historyPath = join(root, "config", "pipelines", "project-1.history.json");
    await mkdir(join(root, "config", "pipelines"), { recursive: true });
    await writeFile(historyPath, "{ incomplete", "utf8");

    await expect(storage.get("run-1", "project-1")).rejects.toThrow(/invalid|json|parse/i);
  });

  it("propagates unexpected history directory failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config", "pipelines"), "not a directory", "utf8");
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));

    await expect(storage.getAll()).rejects.toThrow("EEXIST");
  });

  it("rejects malformed updates before changing the existing history file", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    await storage.save(entry("run-valid", "workflow-a", 10));
    const historyPath = join(root, "config", "pipelines", "project-1.history.json");
    const original = await readFile(historyPath, "utf8");

    await expect(
      storage.update("run-valid", { status: "not-a-status" as never }, "project-1"),
    ).rejects.toThrow("unsupported value");
    await expect(readFile(historyPath, "utf8")).resolves.toBe(original);
  });

  it("preserves concurrent saves made by separate storage instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const first = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    const second = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));

    await Promise.all([
      first.save(entry("run-a", "workflow-a", 10)),
      second.save(entry("run-b", "workflow-b", 20)),
    ]);

    expect((await first.getByPipeline("project-1")).map((run) => run.id).sort()).toEqual([
      "run-a",
      "run-b",
    ]);
  });
});
