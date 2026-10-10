import { describe, expect, it } from "vitest";
import {
  loadWorkflowEntries,
  mergeWorkflowLoadState,
  partitionWorkflowLoads,
} from "./workflow-load-state";

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

describe("loadWorkflowEntries", () => {
  it("preserves successful workflows when an individual load rejects", async () => {
    const secondEntry = { ...entry, id: "w2" };
    const thirdEntry = { ...entry, id: "w3" };
    const result = await loadWorkflowEntries([entry, secondEntry, thirdEntry], async ({ id }) => {
      if (id === "w2") throw new Error("workflow file is unavailable");
      return { type: "success", result: { ...config, id } };
    });

    expect(result?.loaded.map((workflow) => workflow.id)).toEqual(["w1", "w3"]);
    expect(result?.broken).toEqual([{ id: "w2", error: "workflow file is unavailable" }]);
  });

  it("resolves a rejected workflow on retry without replacing healthy rows", async () => {
    const healthyEntry = { ...entry, id: "healthy" };
    const retryEntry = { ...entry, id: "retry" };
    const healthy = { ...healthyEntry, content: { ...config, id: healthyEntry.id } };
    const initial = await loadWorkflowEntries([healthyEntry, retryEntry], async ({ id }) => {
      if (id === retryEntry.id) throw new Error("temporary read failure");
      return { type: "success", result: { ...config, id } };
    });
    expect(initial).toBeDefined();

    const retried = await loadWorkflowEntries([retryEntry], async () => ({
      type: "success",
      result: { ...config, id: retryEntry.id },
    }));
    expect(retried).toBeDefined();
    const recovered = mergeWorkflowLoadState(initial!, retried!);

    expect(recovered.loaded.map((workflow) => workflow.id)).toEqual(["healthy", "retry"]);
    expect(recovered.broken).toEqual([]);
    expect(recovered.loaded.find((workflow) => workflow.id === healthy.id)).toEqual(healthy);
  });

  it("keeps a successful retry when an earlier retry rejects later", async () => {
    const retryEntry = { ...entry, id: "retry" };
    const initial = await loadWorkflowEntries([retryEntry], async () => {
      throw new Error("initial read failure");
    });
    const recovered = await loadWorkflowEntries([retryEntry], async () => ({
      type: "success",
      result: { ...config, id: retryEntry.id },
    }));
    const lateRejected = await loadWorkflowEntries([retryEntry], async () => {
      throw new Error("late retry failure");
    });

    expect(
      mergeWorkflowLoadState(mergeWorkflowLoadState(initial!, recovered!), lateRejected!),
    ).toEqual(recovered);
  });

  it("discards completed loads after the selected project changes", async () => {
    let selectedProject = "p1";
    let resolveLoad!: (value: { type: "success"; result: typeof config }) => void;
    const pendingLoad = new Promise<{ type: "success"; result: typeof config }>((resolve) => {
      resolveLoad = resolve;
    });
    const loadResult = loadWorkflowEntries(
      [entry],
      () => pendingLoad,
      () => selectedProject === entry.project,
    );

    selectedProject = "p2";
    resolveLoad({ type: "success", result: config });

    await expect(loadResult).resolves.toBeUndefined();
  });
});
