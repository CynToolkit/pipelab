import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PipelabContext } from "./context";
import { loadStrictConnections, saveStrictProjects } from "./strict-config-persistence";

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-strict-config-"));
  const context = new PipelabContext({ userDataPath: root });
  await mkdir(context.getConfigPath(), { recursive: true });
  return context;
};

describe("strict config persistence", () => {
  it("does not replace corrupt connections with defaults", async () => {
    const context = await setup();
    await writeFile(context.getConnectionsPath(), "{broken");
    await expect(loadStrictConnections(context)).rejects.toThrow("Malformed JSON");
    await expect(readFile(context.getConnectionsPath(), "utf8")).resolves.toBe("{broken");
  });

  it("prevents deleting a project referenced by a workflow", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "p1", name: "Project", description: "" }],
        pipelines: [],
        workflows: [
          {
            id: "w1",
            project: "p1",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/w1",
          },
        ],
      }),
    );
    await expect(
      saveStrictProjects(context, { version: "3.0.0", projects: [], pipelines: [], workflows: [] }),
    ).rejects.toThrow("cannot be deleted");
  });

  it("prevents generic project saves from mutating workflow index entries", async () => {
    const context = await setup();
    const workflow = {
      id: "w1",
      project: "p1",
      lastModified: "2026-01-01",
      type: "internal-workflow" as const,
      configName: "workflows/w1",
    };
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "p1", name: "Project", description: "" }],
        pipelines: [],
        workflows: [workflow],
      }),
    );
    await expect(
      saveStrictProjects(context, {
        version: "3.0.0",
        projects: [{ id: "p1", name: "Renamed", description: "" }],
        pipelines: [],
        workflows: [{ ...workflow, lastModified: "2026-01-02" }],
      }),
    ).rejects.toThrow("only be changed through ReleasePersistence");
    await expect(
      saveStrictProjects(context, {
        version: "3.0.0",
        projects: [{ id: "p1", name: "Renamed", description: "" }],
        pipelines: [],
        workflows: [workflow],
      }),
    ).resolves.toBeUndefined();
  });
});
