import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { isWorkflowRouteContextValid, scheduleWorkflowRunsRefresh } from "./workflow-runs-state";

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
    expect(isWorkflowRouteContextValid({ id: "flow-1", project: "project-1" }, "flow-1", "project-1")).toBe(true);
    expect(isWorkflowRouteContextValid({ id: "flow-2", project: "project-1" }, "flow-1", "project-1")).toBe(false);
    expect(isWorkflowRouteContextValid({ id: "flow-1", project: "project-2" }, "flow-1", "project-1")).toBe(false);
  });
});
