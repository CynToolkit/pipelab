import { describe, expect, it } from "vitest";
import {
  getDashboardDisplayState,
  isDashboardAuthSettled,
  resolveSelectedProjectId,
} from "./dashboard-state";

describe("resolveSelectedProjectId", () => {
  it("replaces a config default with the first persisted project after loading", () => {
    expect(resolveSelectedProjectId([{ id: "saved-project" }], "main")).toBe("saved-project");
  });

  it("keeps a selected persisted project and clears selection when none exist", () => {
    expect(resolveSelectedProjectId([{ id: "first" }, { id: "selected" }], "selected")).toBe(
      "selected",
    );
    expect(resolveSelectedProjectId([], "main")).toBeUndefined();
  });
});

describe("getDashboardDisplayState", () => {
  it("renders the list state when every persisted workflow is broken", () => {
    expect(
      getDashboardDisplayState({
        workflows: 0,
        brokenWorkflows: 2,
        filteredWorkflows: 0,
      }),
    ).toBe("list");
  });

  it("shows the generic empty state only when nothing exists", () => {
    expect(
      getDashboardDisplayState({
        workflows: 0,
        brokenWorkflows: 0,
        filteredWorkflows: 0,
      }),
    ).toBe("empty");
  });

  it("shows search-empty when workflows exist but none match", () => {
    expect(
      getDashboardDisplayState({
        workflows: 2,
        brokenWorkflows: 0,
        filteredWorkflows: 0,
      }),
    ).toBe("search-empty");
  });
});

describe("isDashboardAuthSettled", () => {
  it("waits for session restoration", () => {
    expect(isDashboardAuthSettled("INITIALIZING", "idle")).toBe(false);
    expect(isDashboardAuthSettled("LOADING", "idle")).toBe(false);
  });

  it("waits for a settled subscription only when signed in", () => {
    expect(isDashboardAuthSettled("SIGNED_IN", "idle")).toBe(false);
    expect(isDashboardAuthSettled("SIGNED_IN", "loading")).toBe(false);
    expect(isDashboardAuthSettled("SIGNED_IN", "ready")).toBe(true);
    expect(isDashboardAuthSettled("SIGNED_IN", "error")).toBe(true);
  });

  it("resolves signed-out and error outcomes", () => {
    expect(isDashboardAuthSettled("SIGNED_OUT", "idle")).toBe(true);
    expect(isDashboardAuthSettled("ERROR", "error")).toBe(true);
  });
});
