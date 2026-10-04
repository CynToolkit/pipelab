import { describe, expect, it } from "vitest";
import plugin, { constructSource, workflowTaskRunners } from "./index";

describe("Construct release validation", () => {
  it("keeps the Release source and workflow task after removing legacy nodes", () => {
    expect(plugin.nodes).toEqual([]);
    expect(plugin.release?.sources?.map((source) => source.id)).toContain(constructSource.id);
    expect(Object.keys(workflowTaskRunners)).toEqual([
      "@pipelab/plugin-construct/export-construct-project",
    ]);
  });

  it("reports source field paths", () => {
    expect(constructSource.validate({})).toEqual([
      expect.objectContaining({ path: "path" }),
      expect.objectContaining({ path: "profilePath" }),
    ]);
  });
});
