import { describe, expect, it } from "vitest";
import { parseFileRepo } from "./projects-definition";

const project = { id: "p1", name: "Project", description: "Description" };

describe("parseFileRepo", () => {
  it("accepts a valid project/workflow index", () => {
    expect(
      parseFileRepo({
        version: "3.0.0",
        projects: [project],
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
      }).projects,
    ).toEqual([project]);
  });

  it("rejects duplicate IDs and stale references", () => {
    expect(() =>
      parseFileRepo({
        version: "3.0.0",
        projects: [project, project],
        pipelines: [],
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
});
