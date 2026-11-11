import { describe, expect, it } from "vitest";
import { runOutcome, shouldNotify } from "./run-notifications";

describe("run notifications", () => {
  it("treats a run that completed with errors as a failure", () => {
    expect(runOutcome("completed")).toBe("success");
    expect(runOutcome("completed-with-errors")).toBe("failure");
    expect(runOutcome("failed")).toBe("failure");
    expect(runOutcome("cancelled")).toBe("cancelled");
  });

  it("notifies by default, honours an opt-out per outcome, and never notifies for a cancel", () => {
    expect(shouldNotify(undefined, "failure")).toBe(true);
    expect(shouldNotify(undefined, "success")).toBe(true);
    expect(shouldNotify({ onSuccess: false }, "success")).toBe(false);
    expect(shouldNotify({ onSuccess: false }, "failure")).toBe(true);
    expect(shouldNotify({ onFailure: false }, "failure")).toBe(false);
    expect(shouldNotify(undefined, "cancelled")).toBe(false);
  });
});
