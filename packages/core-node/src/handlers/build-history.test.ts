import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { PipelabContext } from "../context";
import { BuildHistoryStorage } from "./build-history";
import { filterBuildHistoryEntries } from "./history";

const workspaces: string[] = [];
const entry = (id: string, workflowId: string, startTime: number) => ({
  id,
  projectId: "project-1",
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
  it("reads legacy pipelineId entries from the existing project history file", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    const historyDirectory = context.getConfigPath("pipelines");
    await mkdir(historyDirectory, { recursive: true });
    const { projectId: _projectId, ...legacyEntryFields } = entry("run-legacy", "workflow-a", 10);
    const legacyEntry = { ...legacyEntryFields, pipelineId: "project-1" };
    await writeFile(
      join(historyDirectory, "project-1.history.json"),
      JSON.stringify({ version: "1.0.0", entries: [legacyEntry] }),
    );

    expect((await storage.getByProject("project-1")).map((run) => run.id)).toEqual(["run-legacy"]);

    await storage.save(entry("run-new", "workflow-a", 20));
    const persisted = JSON.parse(
      await readFile(join(historyDirectory, "project-1.history.json"), "utf-8"),
    ) as { entries: Array<Record<string, unknown>> };
    expect(persisted.entries.map((run) => run.id)).toEqual(["run-legacy", "run-new"]);
    expect(persisted.entries.map((run) => run.projectId)).toEqual(["project-1", "project-1"]);
    expect(persisted.entries[0]).not.toHaveProperty("pipelineId");
  });

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
    expect((await storage.getByProject("project-1")).map((item) => item.id)).toEqual([
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
    await expect(
      storage.save({ ...entry("run-invalid", "workflow-a", 10), startTime: Infinity }),
    ).rejects.toThrow("finite number");
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

    expect((await first.getByProject("project-1")).map((run) => run.id).sort()).toEqual([
      "run-a",
      "run-b",
    ]);
  });

  it("preserves separate-process saves for the same project", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const contextUrl = new URL("../context.ts", import.meta.url).href;
    const storageUrl = new URL("./build-history.ts", import.meta.url).href;
    const script = [
      `import { PipelabContext } from ${JSON.stringify(contextUrl)};`,
      `import { BuildHistoryStorage } from ${JSON.stringify(storageUrl)};`,
      `const context = new PipelabContext({ userDataPath: process.argv[1] });`,
      `await new BuildHistoryStorage(context).save(JSON.parse(process.argv[2]));`,
    ].join("\n");
    const run = (id: string, startTime: number) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx/esm",
            "--input-type=module",
            "-e",
            script,
            root,
            JSON.stringify(entry(id, "workflow-a", startTime)),
          ],
          { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
        );
        let stderr = "";
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`History child failed (${code}): ${stderr}`)),
        );
      });

    await Promise.all([run("run-process-a", 10), run("run-process-b", 20)]);

    const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath: root }));
    expect((await storage.getByProject("project-1")).map((run) => run.id).sort()).toEqual([
      "run-process-a",
      "run-process-b",
    ]);
  }, 15_000);

  it("clears project history and its managed run artifacts without touching other projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    const firstRunCache = context.getCachePath("pipelines", "project-1", "run-project-1");
    await storage.save({
      ...entry("run-project-1", "workflow-a", 10),
      cachePath: firstRunCache,
      status: "failed",
    });
    await storage.save({
      ...entry("run-project-2", "workflow-b", 20),
      projectId: "project-2",
      status: "completed",
    });

    const firstRunWorkspace = join(context.getArtifactsPath("workflow", "run-project-1"), "file");
    const secondRunWorkspace = join(context.getArtifactsPath("workflow", "run-project-2"), "file");
    const firstStagingArtifact = join(
      context.getArtifactsPath("project-1", "workflow-staging", "run-project-1"),
      "file",
    );
    const firstRunCacheArtifact = join(firstRunCache, "cache-file");
    const secondStagingArtifact = join(
      context.getArtifactsPath("project-2", "workflow-staging", "run-project-2"),
      "file",
    );
    const unrelatedProjectArtifact = join(
      context.getArtifactsPath("project-1"),
      "unrelated",
      "file",
    );
    const unrelatedWorkflowArtifact = join(
      context.getArtifactsPath("workflow", "unrelated-run"),
      "file",
    );
    for (const path of [
      firstRunWorkspace,
      secondRunWorkspace,
      firstStagingArtifact,
      secondStagingArtifact,
      firstRunCacheArtifact,
      unrelatedProjectArtifact,
      unrelatedWorkflowArtifact,
    ]) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "generated artifact");
    }

    await storage.clearByProject("project-1");

    await expect(readFile(firstRunWorkspace, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(firstStagingArtifact, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(firstRunCacheArtifact, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(secondRunWorkspace, "utf8")).resolves.toBe("generated artifact");
    await expect(readFile(secondStagingArtifact, "utf8")).resolves.toBe("generated artifact");
    await expect(readFile(unrelatedProjectArtifact, "utf8")).resolves.toBe("generated artifact");
    await expect(readFile(unrelatedWorkflowArtifact, "utf8")).resolves.toBe("generated artifact");
    expect(await storage.get("run-project-1", "project-1")).toBeUndefined();
    expect(await storage.get("run-project-2", "project-2")).toMatchObject({ status: "completed" });
  });

  it("clears run workspace artifacts with all history", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    const runCache = context.getCachePath("pipelines", "project-1", "run-a");
    await storage.save({
      ...entry("run-a", "workflow-a", 10),
      cachePath: runCache,
      status: "failed",
    });
    await storage.save({ ...entry("run-b", "workflow-b", 20), status: "completed" });
    const artifact = join(context.getArtifactsPath("workflow", "run-a"), "source.zip");
    const stagingArtifact = join(
      context.getArtifactsPath("project-1", "workflow-staging", "run-a"),
      "staged.zip",
    );
    const runCacheArtifact = join(runCache, "cache-file");
    const unrelatedProjectArtifact = join(context.getArtifactsPath("project-1"), "keep.txt");
    const unrelatedWorkflowArtifact = join(
      context.getArtifactsPath("workflow", "unowned"),
      "keep.txt",
    );
    const unrelatedCacheArtifact = join(
      context.getCachePath("pipelines", "project-1", "keep"),
      "keep.txt",
    );
    for (const path of [
      artifact,
      stagingArtifact,
      runCacheArtifact,
      unrelatedProjectArtifact,
      unrelatedWorkflowArtifact,
      unrelatedCacheArtifact,
    ]) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "generated artifact");
    }

    await storage.clear();

    await expect(readFile(artifact, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(stagingArtifact, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(runCacheArtifact, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(unrelatedProjectArtifact, "utf8")).resolves.toBe("generated artifact");
    await expect(readFile(unrelatedWorkflowArtifact, "utf8")).resolves.toBe("generated artifact");
    await expect(readFile(unrelatedCacheArtifact, "utf8")).resolves.toBe("generated artifact");
    expect(await storage.getAll()).toEqual([]);
  });

  it("preserves a workflow workspace created after all-history cleanup snapshots records", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    await storage.save({ ...entry("run-old", "workflow-a", 10), status: "failed" });

    let continueCleanup!: () => void;
    let signalSnapshot!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      continueCleanup = resolve;
    });
    const snapshotReady = new Promise<void>((resolve) => {
      signalSnapshot = resolve;
    });
    const getAllProjectFiles = Reflect.get(storage, "getAllProjectFiles");
    if (typeof getAllProjectFiles !== "function") throw new Error("History listing method missing");
    const readProjectFiles = getAllProjectFiles.bind(storage) as () => Promise<string[]>;
    Reflect.set(storage, "getAllProjectFiles", async () => {
      const files = await readProjectFiles();
      signalSnapshot();
      await cleanupGate;
      return files;
    });

    const clearing = storage.clear();
    try {
      await snapshotReady;
      await storage.save({
        ...entry("run-new", "workflow-b", 20),
        projectId: "project-2",
        status: "running",
      });
      const artifact = join(context.getArtifactsPath("workflow", "run-new"), "file");
      await mkdir(dirname(artifact), { recursive: true });
      await writeFile(artifact, "active run workspace");
    } finally {
      continueCleanup();
      Reflect.deleteProperty(storage, "getAllProjectFiles");
    }
    await clearing;

    const artifact = join(context.getArtifactsPath("workflow", "run-new"), "file");
    expect(await storage.get("run-new", "project-2")).toMatchObject({ status: "running" });
    await expect(readFile(artifact, "utf8")).resolves.toBe("active run workspace");
  });

  it("keeps history and artifacts when clearing a project with a running workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    await storage.save(entry("run-active", "workflow-a", 10));
    const artifact = join(
      context.getArtifactsPath("project-1", "workflow-staging", "run-active"),
      "file",
    );
    await mkdir(dirname(artifact), { recursive: true });
    await writeFile(artifact, "generated artifact");

    await expect(storage.clearByProject("project-1")).rejects.toThrow(/workflow is running/i);

    expect(await storage.get("run-active", "project-1")).toMatchObject({ status: "running" });
    await expect(readFile(artifact, "utf8")).resolves.toBe("generated artifact");
  });

  it("keeps all history and artifacts when clearing while a workflow is running", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    await storage.save(entry("run-active", "workflow-a", 10));
    await storage.save({
      ...entry("run-completed", "workflow-b", 20),
      projectId: "project-2",
      status: "completed",
    });
    const artifact = join(context.getArtifactsPath("workflow", "run-active"), "file");
    await mkdir(dirname(artifact), { recursive: true });
    await writeFile(artifact, "generated artifact");

    await expect(storage.clear()).rejects.toThrow(/workflow is running/i);

    expect(await storage.getAll()).toHaveLength(2);
    await expect(readFile(artifact, "utf8")).resolves.toBe("generated artifact");
  });

  it("does not follow unsafe run IDs outside managed artifact storage", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    await storage.save({ ...entry("../../outside", "workflow-a", 10), status: "failed" });
    const outsideArtifact = join(root, "outside", "file");
    await mkdir(dirname(outsideArtifact), { recursive: true });
    await writeFile(outsideArtifact, "user file");

    await storage.clearByProject("project-1");

    await expect(readFile(outsideArtifact, "utf8")).resolves.toBe("user file");
  });

  it("does not delete an unsafe persisted cache path", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    const outsideCacheArtifact = join(root, "unmanaged-cache", "file");
    await storage.save({
      ...entry("run-unsafe-cache", "workflow-a", 10),
      cachePath: dirname(outsideCacheArtifact),
      status: "failed",
    });
    await mkdir(dirname(outsideCacheArtifact), { recursive: true });
    await writeFile(outsideCacheArtifact, "user cache");

    await storage.clearByProject("project-1");

    await expect(readFile(outsideCacheArtifact, "utf8")).resolves.toBe("user cache");
    expect(await storage.get("run-unsafe-cache", "project-1")).toBeUndefined();
  });

  it("keeps history when clearing fails to resolve a run artifact path", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-runs-"));
    workspaces.push(root);
    const context = new PipelabContext({ userDataPath: root });
    const storage = new BuildHistoryStorage(context);
    await storage.save({ ...entry("run-cleanup-error", "workflow-a", 10), status: "failed" });
    const getArtifactsPath = context.getArtifactsPath.bind(context);
    Reflect.set(context, "getArtifactsPath", (...paths: string[]) => {
      if (paths[0] === "workflow") throw new Error("permission denied");
      return getArtifactsPath(...paths);
    });

    await expect(storage.clearByProject("project-1")).rejects.toThrow(/permission denied/i);
    expect(await storage.get("run-cleanup-error", "project-1")).toMatchObject({
      status: "failed",
    });
  });
});
