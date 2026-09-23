import { describe, expect, it } from "vitest";
import { getDashboardDisplayState } from "./dashboard-state";

describe("getDashboardDisplayState", () => {
  it("renders the list state when every persisted workflow is broken", () => {
    expect(
      getDashboardDisplayState({
        files: 0,
        workflows: 0,
        brokenWorkflows: 2,
        filteredFiles: 0,
        filteredWorkflows: 0,
      }),
    ).toBe("list");
  });

  it("shows the generic empty state only when nothing exists", () => {
    expect(
      getDashboardDisplayState({
        files: 0,
        workflows: 0,
        brokenWorkflows: 0,
        filteredFiles: 0,
        filteredWorkflows: 0,
      }),
    ).toBe("empty");
  });
});
