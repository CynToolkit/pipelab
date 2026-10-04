import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
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
  it("migrates a V1 project index and drops its legacy Pipeline entries", async () => {
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

    await expect(loadStrictProjects(context)).resolves.toStrictEqual({
      version: "4.0.0",
      projects: [
        { id: "main", name: "Default project", description: "The initial default project" },
      ],
      workflows: [],
    });
  });

  it.each([
    ["malformed V2 projects", { version: "2.0.0", projects: null }],
    ["unknown future version", { version: "5.0.0", projects: [] }],
  ])("rejects %s without rewriting the source document", async (label, raw) => {
    const context = await setup();
    const original = JSON.stringify(raw);
    await writeFile(context.getProjectsPath(), original);

    const load = loadStrictProjects(context);
    if (label === "unknown future version")
      await expect(load).rejects.toThrow("Unsupported project index version '5.0.0'");
    else await expect(load).rejects.toThrow();
    await expect(readFile(context.getProjectsPath(), "utf8")).resolves.toBe(original);
  });

  it("migrates V2 project indexes", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "2.0.0",
        projects: [{ id: "main", name: "Main", description: "" }],
      }),
    );

    await expect(loadStrictProjects(context)).resolves.toMatchObject({
      version: "4.0.0",
      projects: [{ id: "main" }],
      workflows: [],
    });
  });

  it("migrates V3 projects and workflows while ignoring invalid Pipeline metadata", async () => {
    const context = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "main", name: "Main", description: "" }],
        pipelines: null,
        workflows: [
          {
            id: "w1",
            project: "main",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/w1",
          },
        ],
      }),
    );

    await expect(loadStrictProjects(context)).resolves.toStrictEqual({
      version: "4.0.0",
      projects: [{ id: "main", name: "Main", description: "" }],
      workflows: [
        {
          id: "w1",
          project: "main",
          lastModified: "2026-01-01",
          type: "internal-workflow",
          configName: "workflows/w1",
        },
      ],
    });
  });

  it("does not replace corrupt connections with defaults", async () => {
    const context = await setup();
    await writeFile(context.getConnectionsPath(), "{broken");
    await expect(loadStrictConnections(context)).rejects.toThrow("Malformed JSON");
    await expect(readFile(context.getConnectionsPath(), "utf8")).resolves.toBe("{broken");
  });

  it("re-reads a connections file created by another process during initialization", async () => {
    const context = await setup();
    const competingConfig = {
      version: "1.0.0",
      connections: [
        {
          id: "racing-connection",
          pluginName: "provider",
          name: "Racing connection",
          createdAt: "2026-09-23T00:00:00.000Z",
          isDefault: true,
        },
      ],
    };
    const getConnectionsPath = context.getConnectionsPath.bind(context);
    let pathRequests = 0;
    context.getConnectionsPath = () => {
      const path = getConnectionsPath();
      pathRequests += 1;
      if (pathRequests === 2) writeFileSync(path, JSON.stringify(competingConfig), "utf8");
      return path;
    };

    await expect(loadStrictConnections(context)).resolves.toEqual(competingConfig);
    await expect(readFile(getConnectionsPath(), "utf8")).resolves.toBe(
      JSON.stringify(competingConfig),
    );
  });

  it("does not replace malformed project JSON with an empty index", async () => {
    const context = await setup();
    await writeFile(context.getProjectsPath(), "{broken");
    await expect(loadStrictProjects(context)).rejects.toThrow("Malformed JSON");
    await expect(readFile(context.getProjectsPath(), "utf8")).resolves.toBe("{broken");
  });

  it("prevents deleting a project referenced by a workflow", async () => {
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
        version: "4.0.0",
        projects: [{ id: "p1", name: "Project", description: "" }],
        workflows: [workflow],
      }),
    );
    await expect(
      saveStrictProjects(context, { version: "4.0.0", projects: [], workflows: [] }),
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
        version: "4.0.0",
        projects: [{ id: "p1", name: "Project", description: "" }],
        workflows: [workflow],
      }),
    );
    await expect(
      saveStrictProjects(context, {
        version: "4.0.0",
        projects: [{ id: "p1", name: "Renamed", description: "" }],
        workflows: [{ ...workflow, lastModified: "2026-01-02" }],
      }),
    ).rejects.toThrow("only be changed through ReleasePersistence");
    await expect(
      saveStrictProjects(context, {
        version: "4.0.0",
        projects: [{ id: "p1", name: "Renamed", description: "" }],
        workflows: [workflow],
      }),
    ).resolves.toBeUndefined();
  });
});
