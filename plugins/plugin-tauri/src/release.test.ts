import { describe, expect, it } from "vitest";
import { tauriTargetInputs } from "./index";

describe("Tauri release targets", () => {
  it("maps release targets to runner platform and architecture", () => {
    expect(tauriTargetInputs("linux-x64")).toEqual({ platform: "linux", arch: "x64" });
    expect(tauriTargetInputs("macos-arm64")).toEqual({ platform: "darwin", arch: "arm64" });
  });
});
