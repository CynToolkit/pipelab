import { describe, expect, it } from "vitest";
import { hostTargetOf, RELEASE_DEFAULTS, validateReleaseDefaults } from "@pipelab/shared";
import { buildCoreReleaseRegistry } from "./registry";

const registry = buildCoreReleaseRegistry();

describe("RELEASE_DEFAULTS against the built-in registry", () => {
  it("has no problems", () => {
    expect(validateReleaseDefaults(RELEASE_DEFAULTS, registry)).toEqual([]);
  });

  it.each([
    [{ platform: "win32", architecture: "x64" }, "windows-x64"],
    [{ platform: "linux", architecture: "x64" }, "linux-x64"],
    [{ platform: "darwin", architecture: "arm64" }, "macos-arm64"],
  ])("resolves the desktop host entries on %j to %s", (host, targetId) => {
    const electron = registry.producers.find(
      (item) => item.id === "@pipelab/plugin-electron/producer",
    );
    const godot = registry.producers.find((item) => item.id === "@pipelab/plugin-godot/producer");
    expect(electron && hostTargetOf(electron, "desktop", host)?.id).toBe(targetId);
    expect(godot && hostTargetOf(godot, "desktop", host)?.id).toBe(targetId);
  });

  it("resolves no desktop host target on a host Godot cannot export to", () => {
    const godot = registry.producers.find((item) => item.id === "@pipelab/plugin-godot/producer");
    expect(
      godot && hostTargetOf(godot, "desktop", { platform: "win32", architecture: "arm64" }),
    ).toBeUndefined();
  });
});
