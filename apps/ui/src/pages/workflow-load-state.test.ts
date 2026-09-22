import { describe, expect, it } from "vitest";
import { partitionWorkflowLoads } from "./workflow-load-state";

const entry = { id: "w1", project: "p1", lastModified: "2026-01-01", configName: "workflows/w1" };
const config = {
  version: "3.0.0" as const,
  id: "w1",
  project: "p1",
  name: "Release",
  source: { provider: "source", config: {} },
  builds: [],
  destinations: [],
};

describe("partitionWorkflowLoads", () => {
  it("keeps failed loads visible as broken instead of dropping them", () => {
    const result = partitionWorkflowLoads(
      [entry],
      [{ type: "error", ipcError: "missing workflow" }],
    );
    expect(result.loaded).toHaveLength(0);
    expect(result.broken).toEqual([{ id: "w1", error: "missing workflow" }]);
  });

  it("rejects identity mismatches", () => {
    const result = partitionWorkflowLoads(
      [entry],
      [{ type: "success", result: { ...config, project: "other" } }],
    );
    expect(result.broken[0].id).toBe("w1");
  });
});
