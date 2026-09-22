import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseConfig } from "@pipelab/shared";
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

  it("makes execution fail at the validated persistence boundary for a missing workflow", async () => {
    const { context } = await setup();
    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "file is missing",
    );
  });
});
