import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseConfig, usePlugins } from "@pipelab/shared";
import steam from "@pipelab/plugin-steam";
import { PipelabContext } from "./context";
import { ReleasePersistence } from "./release-persistence";
import { writeJsonFileAtomically } from "./utils/atomic-json";
import { executeWorkflow } from "./handlers/workflow";

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-release-persistence-"));
  const context = new PipelabContext({ userDataPath: root });
  await mkdir(context.getConfigPath(), { recursive: true });
  await writeFile(
    context.getProjectsPath(),
    JSON.stringify({
      version: "3.0.0",
      projects: [{ id: "project-1", name: "Project", description: "" }],
      pipelines: [],
      workflows: [
        {
          id: "workflow-1",
          project: "project-1",
          lastModified: "2026-01-01T00:00:00.000Z",
          type: "internal-workflow",
          configName: "workflows/workflow-1",
        },
      ],
    }),
  );
  return { context, persistence: new ReleasePersistence(context) };
};

describe("ReleasePersistence", () => {
  it("rejects stale connection references before workflow execution starts", async () => {
    const { context, persistence } = await setup();
    usePlugins().registerPlugins([steam]);
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: { provider: "source", config: {} },
      }),
      destinations: [
        {
          id: "steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: { accountConnectionId: "deleted-connection", appId: "123" },
          slots: [],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    await writeFile(
      context.getConnectionsPath(),
      JSON.stringify({ version: "1.0.0", connections: [] }),
    );

    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "Connection 'deleted-connection' does not exist.",
    );
    await writeFile(
      context.getConnectionsPath(),
      JSON.stringify({
        version: "1.0.0",
        connections: [
          {
            id: "deleted-connection",
            pluginName: "@pipelab/plugin-other",
            name: "Other account",
            createdAt: "2026-01-01",
            isDefault: false,
          },
        ],
      }),
    );
    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "does not belong to integration '@pipelab/plugin-steam'",
    );
    await expect(persistence.load("workflow-1")).resolves.toMatchObject({ id: "workflow-1" });
  });

  it("does not create a missing workflow while loading", async () => {
    const { context, persistence } = await setup();
    await expect(persistence.load("workflow-1")).rejects.toThrow("file is missing");
    await expect(stat(context.getConfigPath("workflows", "workflow-1.json"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  it("loads and atomically saves a canonical workflow", async () => {
    const { context, persistence } = await setup();
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: { path: "project" } },
    });
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, JSON.stringify(config));
    await expect(persistence.load("workflow-1", "project-1")).resolves.toEqual(config);
    const updated = { ...config, name: "Updated" };
    await persistence.save(updated, "project-1");
    await expect(readFile(workflowPath, "utf8")).resolves.toContain('"name": "Updated"');
  });

  it("preserves both concurrently-created workflow index entries", async () => {
    const { context } = await setup();
    const delayedWriter = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath())
        await new Promise((resolve) => setTimeout(resolve, 20));
      await writeJsonFileAtomically(filePath, value);
    };
    const first = new ReleasePersistence(context, delayedWriter);
    const second = new ReleasePersistence(context, delayedWriter);
    const config = (id: string) =>
      createReleaseConfig({
        id,
        project: "project-1",
        name: id,
        source: { provider: "source", config: {} },
      });

    await Promise.all([first.save(config("workflow-a")), second.save(config("workflow-b"))]);

    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([
      "workflow-1",
      "workflow-a",
      "workflow-b",
    ]);
  });

  it("serializes a workflow save racing with delete without stale index state", async () => {
    const { context } = await setup();
    const persistence = new ReleasePersistence(context);
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      workflowPath,
      JSON.stringify(
        createReleaseConfig({
          id: "workflow-1",
          project: "project-1",
          name: "Existing",
          source: { provider: "source", config: {} },
        }),
      ),
    );
    const newConfig = createReleaseConfig({
      id: "workflow-a",
      project: "project-1",
      name: "New",
      source: { provider: "source", config: {} },
    });

    await Promise.all([persistence.save(newConfig), persistence.delete("workflow-1")]);

    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows.map((workflow: { id: string }) => workflow.id)).toContain("workflow-a");
    expect(repo.workflows.map((workflow: { id: string }) => workflow.id)).not.toContain(
      "workflow-1",
    );
    await expect(stat(workflowPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(context.getConfigPath("workflows", "workflow-a.json")),
    ).resolves.toBeDefined();
  });

  it("does not overwrite an orphaned workflow file during creation", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "orphan.json");
    const original = JSON.stringify({ preserved: true });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, original);
    const config = createReleaseConfig({
      id: "orphan",
      project: "project-1",
      name: "Should not replace orphan",
      source: { provider: "source", config: {} },
    });

    await expect(persistence.save(config, "project-1")).rejects.toThrow("orphaned");
    await expect(readFile(workflowPath, "utf8")).resolves.toBe(original);
  });

  it("leaves malformed and mismatched workflow files untouched", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, "{not-json");
    await expect(persistence.load("workflow-1")).rejects.toThrow(
      /Malformed JSON|invalid persisted data/,
    );
    await expect(readFile(workflowPath, "utf8")).resolves.toBe("{not-json");

    const mismatched = createReleaseConfig({
      id: "other",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(mismatched));
    await expect(persistence.load("workflow-1")).rejects.toThrow("does not match index entry");
  });

  it("surfaces the persisted-field reason when workflow parsing fails", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      workflowPath,
      JSON.stringify({
        ...createReleaseConfig({
          id: "workflow-1",
          project: "project-1",
          name: "Release",
          source: { provider: "source", config: {} },
        }),
        description: 42,
      }),
    );

    await expect(persistence.load("workflow-1")).rejects.toThrow("description");
  });

  it("rejects a workflow whose indexed project is missing", async () => {
    const { context, persistence } = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "other", name: "Other", description: "" }],
        pipelines: [],
        workflows: [
          {
            id: "workflow-1",
            project: "missing",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/workflow-1",
          },
        ],
      }),
    );
    await expect(persistence.load("workflow-1")).rejects.toThrow(
      /missing project|Project index is invalid/,
    );
  });

  it("rejects route and file identity mismatches", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    await expect(persistence.load("workflow-1", "other-project")).rejects.toThrow(
      "not 'other-project'",
    );
    await writeFile(workflowPath, JSON.stringify({ ...config, id: "other-workflow" }));
    await expect(persistence.load("workflow-1")).rejects.toThrow("does not match index entry");
  });

  it("rolls the workflow file back when updating the index fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const original = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Original",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(original));
    const writer = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath()) throw new Error("index write failed");
      await writeJsonFileAtomically(filePath, value);
    };
    const persistence = new ReleasePersistence(context, writer);
    await expect(persistence.save({ ...original, name: "Changed" }, "project-1")).rejects.toThrow(
      "Unable to update the workflow index",
    );
    const restored = JSON.parse(await readFile(workflowPath, "utf8"));
    expect(restored).toEqual(original);
  });

  it("does not restore a workflow after the index commit if tombstone cleanup fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "To delete",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    let cleanupAttempts = 0;
    const persistence = new ReleasePersistence(context, writeJsonFileAtomically, {
      rename,
      rm: async (path, options) => {
        if (String(path).includes(".deleting-") && cleanupAttempts++ === 0)
          throw new Error("tombstone cleanup failed");
        return rm(path, options);
      },
    });

    await expect(persistence.delete("workflow-1")).resolves.toBeUndefined();
    await expect(stat(workflowPath)).rejects.toMatchObject({ code: "ENOENT" });
    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows).toEqual([]);
  });

  it("restores the workflow file when delete index mutation fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "To preserve",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    const writer = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath()) throw new Error("index write failed");
      await writeJsonFileAtomically(filePath, value);
    };
    const persistence = new ReleasePersistence(context, writer);

    await expect(persistence.delete("workflow-1")).rejects.toThrow("Unable to delete workflow");
    await expect(readFile(workflowPath, "utf8")).resolves.toBe(JSON.stringify(config));
    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows).toHaveLength(1);
  });

  it("makes execution fail at the validated persistence boundary for a missing workflow", async () => {
    const { context } = await setup();
    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "file is missing",
    );
  });

  it.each(["../connections", "../../foo", "foo/bar", "foo\\bar", "/tmp/workflow"])(
    "rejects unsafe workflow ID %j before filesystem access",
    async (workflowId) => {
      const { persistence } = await setup();
      await expect(persistence.load(workflowId)).rejects.toThrow("not safe for persistence");
    },
  );
});
