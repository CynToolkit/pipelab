import { describe, expect, it } from "vitest";
import { parseFileRepo } from "./projects-definition";

const project = { id: "p1", name: "Project", description: "Description" };

describe("parseFileRepo", () => {
  it("accepts a valid project/workflow index", () => {
    expect(
      parseFileRepo({
        version: "4.0.0",
        projects: [project],
        workflows: [
          {
            id: "w1",
            project: "p1",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/w1",
          },
        ],
      }).projects,
    ).toEqual([project]);
  });

  it("rejects duplicate IDs and stale references", () => {
    expect(() =>
      parseFileRepo({
        version: "4.0.0",
        projects: [project, project],
        workflows: [
          {
            id: "w1",
            project: "missing",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/other",
          },
        ],
      }),
    ).toThrow("duplicated");
  });

  it("rejects unsafe project and workflow IDs", () => {
    expect(() =>
      parseFileRepo({
        version: "4.0.0",
        projects: [{ id: "../project", name: "Project", description: "Description" }],
        workflows: [],
      }),
    ).toThrow("safe non-empty persisted ID");
  });

  it("rejects workflow entries with a non-internal type", () => {
    expect(() =>
      parseFileRepo({
        version: "4.0.0",
        projects: [project],
        workflows: [
          {
            id: "w1",
            project: "p1",
            lastModified: "2026-01-01",
            type: "external-workflow",
            configName: "workflows/w1",
          },
        ],
      }),
    ).toThrow("type must be 'internal-workflow'");
  });

  it("normalizes omitted workflows and drops stale pipeline metadata", () => {
    expect(
      parseFileRepo({ version: "4.0.0", projects: [project], pipelines: [{ id: "stale" }] }),
    ).toMatchObject({
      version: "4.0.0",
      projects: [project],
      workflows: [],
    });
  });
});
