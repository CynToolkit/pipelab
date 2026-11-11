import type { Availability, ReleaseHostContext } from "@pipelab/shared";

const HOST_OF_PLATFORM: Record<string, string> = {
  windows: "win32",
  linux: "linux",
  macos: "darwin",
};

const HOST_LABEL: Record<string, string> = {
  win32: "Windows",
  linux: "Linux",
  darwin: "macOS",
};

const PLATFORM_LABEL: Record<string, string> = {
  windows: "Windows",
  linux: "Linux",
  macos: "macOS",
};

/** The target can only be produced on a host of the same platform. */
export const requiresHostOfSamePlatform = (
  platform: string,
  host: ReleaseHostContext,
): Availability =>
  host.platform === HOST_OF_PLATFORM[platform]
    ? { available: true }
    : {
        available: false,
        reason: `${PLATFORM_LABEL[platform] ?? platform} builds need a ${PLATFORM_LABEL[platform] ?? platform} host; this one is ${HOST_LABEL[host.platform] ?? host.platform}.`,
      };

/** macOS packaging needs a macOS host; every other target builds anywhere. */
export const requiresMacHostForMacTargets = (
  platform: string,
  host: ReleaseHostContext,
): Availability =>
  platform === "macos" ? requiresHostOfSamePlatform(platform, host) : { available: true };
