import { describe, expect, it } from "vitest";
import { formatSavedConstructVersion } from "./export-c3p.js";

describe("Construct project release version", () => {
  it("preserves patch releases encoded in savedWithRelease", () => {
    expect(formatSavedConstructVersion(39700)).toBe("r397");
    expect(formatSavedConstructVersion(43202)).toBe("r432-2");
    expect(formatSavedConstructVersion(3802)).toBe("r38-2");
    expect(formatSavedConstructVersion(9900)).toBe("r99");
  });

  it("returns undefined when the decoded release is not positive or metadata is invalid", () => {
    expect(formatSavedConstructVersion(0)).toBeUndefined();
    expect(formatSavedConstructVersion(99)).toBeUndefined();
    expect(formatSavedConstructVersion("43202")).toBeUndefined();
  });
});
