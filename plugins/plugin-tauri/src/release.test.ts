import { describe, expect, it } from "vitest";
import plugin, { tauriTargetInputs, workflowTaskRunners } from "./index";

describe("Tauri release targets", () => {
  it("keeps its Release producer and task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.producers?.map((producer) => producer.id)).toContain(
      "@pipelab/plugin-tauri/producer",
    );
    expect(Object.keys(workflowTaskRunners)).toEqual(["@pipelab/plugin-tauri/tauri:package:v2"]);
  });

  it("maps release targets to runner platform and architecture", () => {
    expect(tauriTargetInputs("linux-x64")).toEqual({ platform: "linux", arch: "x64" });
    expect(tauriTargetInputs("macos-arm64")).toEqual({ platform: "darwin", arch: "arm64" });
  });
});
