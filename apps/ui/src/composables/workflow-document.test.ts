import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { ReleaseConfig } from "@pipelab/shared";
import {
  createWorkflowDocument,
  PLAN_DELAY_MS,
  SAVE_DELAY_MS,
  type WorkflowDocumentDeps,
} from "./workflow-document";

const config = (over: Partial<ReleaseConfig> = {}): ReleaseConfig =>
  ({
    version: "3.0.0",
    id: "flow-1",
    project: "main",
    name: "One",
    source: { provider: "folder", config: {} },
    builds: [],
    destinations: [],
    ...over,
  }) as unknown as ReleaseConfig;

const setup = (stored: ReleaseConfig = config()) => {
  let saved = stored;
  const calls: string[] = [];
  const execute = vi.fn(async (channel: string, data?: { data?: ReleaseConfig }) => {
    calls.push(channel);
    if (channel === "workflow:load") return { type: "success", result: structuredClone(saved) };
    if (channel === "workflow:save") {
      saved = structuredClone(data!.data!);
      return { type: "success", result: { result: "ok" } };
    }
    if (channel === "release:plan")
      return { type: "success", result: { issues: [], graph: { nodes: [], edges: [] } } };
    throw new Error(channel);
  });
  const flowId = ref("flow-1");
  const projectId = ref("main");
  const isReady = ref(true);
  const deps = { flowId, projectId, isReady, execute } as unknown as WorkflowDocumentDeps;
  const doc = createWorkflowDocument(deps);
  return {
    doc,
    execute,
    calls,
    flowId,
    isReady,
    saved: () => saved,
    setSaved: (c: ReleaseConfig) => (saved = c),
  };
};

describe("workflow document", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates a loaded workflow without counting it as an edit", async () => {
    const { doc, calls } = setup();
    expect(await doc.load()).toEqual({ ok: true, hydrated: true });
    expect(doc.flow.value?.name).toBe("One");
    expect(doc.changeRevision.value).toBe(0);
    expect(doc.hasUnsaved.value).toBe(false);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(calls).toEqual(["workflow:load"]);
  });

  it("plans, then saves, once an edit settles", async () => {
    const { doc, calls, saved } = setup();
    await doc.load();
    doc.flow.value!.name = "Renamed";
    expect(doc.hasUnsaved.value).toBe(true);
    await vi.advanceTimersByTimeAsync(PLAN_DELAY_MS);
    expect(calls).toContain("release:plan");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saved().name).toBe("Renamed");
    expect(doc.saveState.value).toBe("saved");
    expect(doc.hasUnsaved.value).toBe(false);
  });

  it("collapses a burst of edits into one save", async () => {
    const { doc, execute } = setup();
    await doc.load();
    for (const name of ["a", "ab", "abc"]) {
      doc.flow.value!.name = name;
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(execute.mock.calls.filter(([channel]) => channel === "workflow:save")).toHaveLength(1);
  });

  it("keeps unsaved edits when the workflow is loaded again", async () => {
    const { doc, setSaved } = setup();
    await doc.load();
    doc.flow.value!.name = "Draft";
    setSaved(config({ name: "Changed elsewhere" }));
    expect(await doc.load()).toEqual({ ok: true, hydrated: false });
    expect(doc.flow.value?.name).toBe("Draft");
  });

  it("flushes pending edits before switching to another workflow", async () => {
    const { doc, flowId, saved } = setup();
    await doc.load();
    doc.flow.value!.name = "Pending";
    flowId.value = "flow-2";
    await doc.load().catch(() => {});
    expect(saved().name).toBe("Pending");
  });

  it("sync picks up another tab's save and re-plans, only when it differs", async () => {
    const { doc, setSaved, execute } = setup();
    await doc.load();
    await doc.sync();
    expect(execute.mock.calls.filter(([c]) => c === "release:plan")).toHaveLength(0);
    setSaved(config({ name: "From Builds" }));
    await doc.sync();
    expect(doc.flow.value?.name).toBe("From Builds");
    expect(doc.hasUnsaved.value).toBe(false);
    expect(execute.mock.calls.filter(([c]) => c === "release:plan")).toHaveLength(1);
  });

  it("sync never overwrites unsaved edits", async () => {
    const { doc, setSaved } = setup();
    await doc.load();
    doc.flow.value!.name = "Mine";
    setSaved(config({ name: "Theirs" }));
    await doc.sync();
    expect(doc.flow.value?.name).toBe("Mine");
  });

  it("saves again when edited while a save is in flight", async () => {
    const { doc, saved } = setup();
    await doc.load();
    doc.flow.value!.name = "first";
    const pending = doc.flush();
    doc.flow.value!.name = "second";
    await pending;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(saved().name).toBe("second");
    expect(doc.saveState.value).toBe("saved");
  });

  it("reports an error and keeps the edit when the engine disconnects mid-edit", async () => {
    const { doc, isReady } = setup();
    await doc.load();
    doc.flow.value!.name = "Draft";
    isReady.value = false;
    await nextTick();
    expect(doc.saveState.value).toBe("error");
    expect(doc.hasUnsaved.value).toBe(true);
    expect(doc.flow.value?.name).toBe("Draft");
  });

  it("refuses to save when told it is blocked", async () => {
    const { execute } = setup();
    const flowId = ref("flow-1");
    const doc = createWorkflowDocument({
      flowId,
      projectId: ref("main"),
      isReady: ref(true),
      execute,
      saveBlockedReason: () => "Fix invalid names",
    } as unknown as WorkflowDocumentDeps);
    await doc.load();
    doc.flow.value!.name = "x";
    await expect(doc.flush()).rejects.toThrow("Fix invalid names");
    expect(doc.saveState.value).toBe("error");
    expect(execute.mock.calls.filter(([c]) => c === "workflow:save")).toHaveLength(0);
  });

  it("ensure waits for a load in flight instead of loading twice", async () => {
    const { doc, execute } = setup();
    const first = doc.load();
    expect(await doc.ensure()).toBe(true);
    await first;
    expect(execute.mock.calls.filter(([c]) => c === "workflow:load")).toHaveLength(1);
    expect(await doc.ensure()).toBe(true);
    expect(execute.mock.calls.filter(([c]) => c === "workflow:load")).toHaveLength(1);
  });

  it("clears the plan when a different workflow is loaded", async () => {
    const { doc, flowId, setSaved } = setup();
    await doc.load();
    await doc.refreshPlan();
    expect(doc.plan.value).toBeDefined();
    flowId.value = "flow-2";
    setSaved(config({ id: "flow-2" }));
    await doc.load();
    expect(doc.flow.value?.id).toBe("flow-2");
    expect(doc.plan.value).toBeUndefined();
  });
});
