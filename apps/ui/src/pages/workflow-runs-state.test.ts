import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildHistoryEntry } from "@pipelab/shared";
import {
  isWorkflowRouteContextValid,
  resolveWorkflowRunsState,
  scheduleWorkflowRunsRefresh,
} from "./workflow-runs-state";

const run = (status: BuildHistoryEntry["status"]) => ({ status }) as BuildHistoryEntry;

afterEach(() => vi.useRealTimers());

describe("scheduleWorkflowRunsRefresh", () => {
  it("refreshes while at least one run is active", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    scheduleWorkflowRunsRefresh([run("completed"), run("running")], refresh);

    await vi.advanceTimersByTimeAsync(1000);

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stops scheduling refreshes when no runs remain active", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    expect(scheduleWorkflowRunsRefresh([run("failed"), run("cancelled")], refresh)).toBeUndefined();
    vi.advanceTimersByTime(5000);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("workflow route context", () => {
  it("requires both workflow and project IDs to match the route", () => {
    expect(
      isWorkflowRouteContextValid({ id: "flow-1", project: "project-1" }, "flow-1", "project-1"),
    ).toBe(true);
    expect(
      isWorkflowRouteContextValid({ id: "flow-2", project: "project-1" }, "flow-1", "project-1"),
    ).toBe(false);
    expect(
      isWorkflowRouteContextValid({ id: "flow-1", project: "project-2" }, "flow-1", "project-1"),
    ).toBe(false);
  });
});

describe("workflow runs load state", () => {
  const history = { type: "success" as const, result: { entries: [] as BuildHistoryEntry[] } };

  it("surfaces workflow failures independently of successful history", () => {
    const state = resolveWorkflowRunsState(
      history,
      { type: "error", ipcError: "Workflow file is corrupt" },
      "flow-1",
      "project-1",
    );
    expect(state.workflowError).toBe("Workflow file is corrupt");
    expect(state.historyError).toBe("");
    expect(state.entries).toEqual([]);
  });

  it("preserves both errors and rejects a workflow from a different route", () => {
    const bothFailed = resolveWorkflowRunsState(
      { type: "error", ipcError: "History unavailable" },
      { type: "error", ipcError: "Workflow missing" },
      "flow-1",
      "project-1",
    );
    expect(bothFailed.historyError).toBe("History unavailable");
    expect(bothFailed.workflowError).toBe("Workflow missing");

    const mismatched = resolveWorkflowRunsState(
      history,
      { type: "success", result: { id: "flow-2", project: "project-1" } },
      "flow-1",
      "project-1",
    );
    expect(mismatched.workflowError).toContain("does not match");
    expect(mismatched.entries).toEqual([]);
  });

  it("clears a transient workflow error after a successful retry", () => {
    const retried = resolveWorkflowRunsState(
      history,
      { type: "success", result: { id: "flow-1", project: "project-1", name: "Release" } },
      "flow-1",
      "project-1",
    );
    expect(retried.workflowError).toBe("");
    expect(retried.workflowName).toBe("Release");
  });
});
