import { describe, expect, it } from "vitest";
import electron from "./electron";
import tauri from "./tauri";
import type { ProviderReleaseDefinition } from "@pipelab/shared";

const hosts = { win32: "win32", linux: "linux", darwin: "darwin" } as const;
const availability = (
  provider: { release?: ProviderReleaseDefinition },
  targetId: string,
  platform: string,
) =>
  provider.release?.producers
    ?.flatMap((producer) => producer.targets)
    .find((target) => target.id === targetId)
    ?.isAvailable?.({ platform, architecture: "x64" })?.available;

describe("host build matrix", () => {
  it("builds Electron macOS only on a macOS host and everything else anywhere", () => {
    expect(availability(electron, "macos-arm64", hosts.linux)).toBe(false);
    expect(availability(electron, "macos-arm64", hosts.win32)).toBe(false);
    expect(availability(electron, "macos-arm64", hosts.darwin)).toBe(true);
    for (const host of Object.values(hosts)) {
      expect(availability(electron, "windows-x64", host)).toBe(true);
      expect(availability(electron, "linux-x64", host)).toBe(true);
    }
  });

  it("builds Tauri only for the host's own platform", () => {
    for (const [target, host] of [
      ["windows-x64", hosts.win32],
      ["linux-x64", hosts.linux],
      ["macos-arm64", hosts.darwin],
    ] as const) {
      expect(availability(tauri, target, host)).toBe(true);
      for (const other of Object.values(hosts).filter((candidate) => candidate !== host))
        expect(availability(tauri, target, other)).toBe(false);
    }
  });
});
