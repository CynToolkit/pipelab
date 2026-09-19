import { describe, expect, it } from "vitest";
import { electronTargetInputs } from "./index";

describe("Electron release targets", () => {
  it("maps release targets to forge platform and architecture", () => {
    expect(electronTargetInputs("windows-x64")).toEqual({ platform: "win32", arch: "x64" });
    expect(electronTargetInputs("macos-arm64")).toEqual({ platform: "darwin", arch: "arm64" });
  });
});
