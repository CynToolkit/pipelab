import { describe, expect, it } from "vitest";
import provider, { electronTargetInputs } from "./index";

describe("Electron release targets", () => {
  it("maps release targets to forge platform and architecture", () => {
    expect(electronTargetInputs("windows-x64")).toEqual({ platform: "win32", arch: "x64" });
    expect(electronTargetInputs("macos-arm64")).toEqual({ platform: "darwin", arch: "arm64" });
  });

  it("declares Windows x64 as a desktop target without declaring itself the default", () => {
    const electronProducer = provider.release?.producers?.[0];
    expect(electronProducer?.targets).toContainEqual(
      expect.objectContaining({ id: "windows-x64", buildType: "desktop" }),
    );
    for (const target of electronProducer?.targets ?? []) {
      expect(target).not.toHaveProperty("defaultFor");
    }
  });
});
