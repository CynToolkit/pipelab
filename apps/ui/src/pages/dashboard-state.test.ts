import { describe, expect, it } from "vitest";
import { getDashboardDisplayState } from "./dashboard-state";

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
