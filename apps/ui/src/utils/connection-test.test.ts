import { describe, expect, it } from "vitest";
import {
  connectionTestFingerprint,
  connectionTestMessage,
  currentConnectionTest,
  decideConnectionSave,
} from "./connection-test";

const fp = connectionTestFingerprint("@pipelab/plugin-itch", { apiKey: "a" });

describe("decideConnectionSave", () => {
  it("tests first when the current values were not tested", () => {
    expect(decideConnectionSave({ testable: true, fingerprint: fp })).toEqual({ action: "test" });
  });

  it("blocks a failed test with its message", () => {
    expect(
      decideConnectionSave({
        testable: true,
        fingerprint: fp,
        tested: { fingerprint: fp, result: { status: "failed", message: "rejected" } },
      }),
    ).toEqual({ action: "block", message: "rejected" });
  });

  it("saves after verified and unverifiable results", () => {
    for (const result of [
      { status: "verified" },
      { status: "unverifiable", reason: "offline" },
    ] as const) {
      expect(
        decideConnectionSave({
          testable: true,
          fingerprint: fp,
          tested: { fingerprint: fp, result },
        }),
      ).toEqual({ action: "save" });
    }
  });

  it("invalidates a result when a field changes", () => {
    const edited = connectionTestFingerprint("@pipelab/plugin-itch", { apiKey: "b" });
    const tested = { fingerprint: fp, result: { status: "verified" } } as const;
    expect(decideConnectionSave({ testable: true, fingerprint: edited, tested })).toEqual({
      action: "test",
    });
    expect(currentConnectionTest(edited, tested)).toBeUndefined();
    expect(currentConnectionTest(fp, tested)).toEqual({ status: "verified" });
  });

  it("saves untestable types directly", () => {
    expect(decideConnectionSave({ testable: false, fingerprint: fp })).toEqual({ action: "save" });
  });
});

describe("connectionTestMessage", () => {
  it("describes each outcome", () => {
    expect(connectionTestMessage({ status: "verified" })).toBe("Connection verified");
    expect(connectionTestMessage({ status: "failed", message: "no" })).toBe("no");
    expect(connectionTestMessage({ status: "unverifiable", reason: "offline" })).toBe("offline");
  });
});
