import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PipelabContext } from "./context";
import {
  loadStrictConnections,
  loadStrictProjects,
  saveStrictProjects,
} from "./strict-config-persistence";

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-strict-config-"));
  const context = new PipelabContext({ userDataPath: root });
  await mkdir(context.getConfigPath(), { recursive: true });
  return context;
};

describe("strict config persistence", () => {
  it("loads a valid V1 project index before migrating it", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "1.0.0",
        data: {
          pipeline: {
            project: "main",
            type: "internal",
            configName: "pipeline",
            lastModified: "2026-01-01",
          },
        },
      }),
    );

    await expect(loadStrictProjects(context)).resolves.toMatchObject({
      version: "3.0.0",
      projects: [{ id: "main" }],
      pipelines: [{ id: "pipeline" }],
      workflows: [],
    });
  });

  it.each([
    ["V1 data null", { version: "1.0.0", data: null }],
    ["malformed V1 pipeline entries", { version: "1.0.0", data: { pipeline: null } }],
    ["malformed V2 projects", { version: "2.0.0", projects: null }],
    ["unknown future version", { version: "4.0.0", projects: [] }],
  ])("rejects %s without rewriting the source document", async (label, raw) => {
    const context = await setup();
    const original = JSON.stringify(raw);
    await writeFile(context.getProjectsPath(), original);

    const load = loadStrictProjects(context);
    if (label === "unknown future version")
      await expect(load).rejects.toThrow("Unsupported project index version '4.0.0'");
    else await expect(load).rejects.toThrow();
    await expect(readFile(context.getProjectsPath(), "utf8")).resolves.toBe(original);
  });

  it("loads V2 project indexes with omitted pipelines", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "2.0.0",
        projects: [{ id: "main", name: "Main", description: "" }],
      }),
    );

    await expect(loadStrictProjects(context)).resolves.toMatchObject({
      version: "3.0.0",
      pipelines: [],
      workflows: [],
    });
  });

  it("normalizes V3 project indexes with supported optional arrays omitted", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "main", name: "Main", description: "" }],
      }),
    );

    await expect(loadStrictProjects(context)).resolves.toMatchObject({
      version: "3.0.0",
      pipelines: [],
      workflows: [],
    });
  });

  it("does not replace corrupt connections with defaults", async () => {
    const context = await setup();
    await writeFile(context.getConnectionsPath(), "{broken");
    await expect(loadStrictConnections(context)).rejects.toThrow("Malformed JSON");
    await expect(readFile(context.getConnectionsPath(), "utf8")).resolves.toBe("{broken");
  });

  it("does not replace malformed project JSON with an empty index", async () => {
    const context = await setup();
    await writeFile(context.getProjectsPath(), "{broken");
    await expect(loadStrictProjects(context)).rejects.toThrow("Malformed JSON");
    await expect(readFile(context.getProjectsPath(), "utf8")).resolves.toBe("{broken");
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
