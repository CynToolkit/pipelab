import { describe, expect, it } from "vitest";
import { getDashboardDisplayState, resolveSelectedProjectId } from "./dashboard-state";

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
