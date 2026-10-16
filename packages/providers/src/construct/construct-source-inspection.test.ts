import { describe, expect, it, vi } from "vitest";

const { discoverBrowserProfiles, isChromiumProfileDirectory, listChromiumBrowserProfiles } =
  vi.hoisted(() => ({
    discoverBrowserProfiles: vi.fn(),
    isChromiumProfileDirectory: vi.fn(),
    listChromiumBrowserProfiles: vi.fn(),
  }));

vi.mock("./browser-profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./browser-profiles")>()),
  discoverBrowserProfiles,
  isChromiumProfileDirectory,
  listChromiumBrowserProfiles,
}));

import { constructSource } from "./index";

describe("Construct source inspection", () => {
  it("lists local Chromium profiles without running full browser inspection", async () => {
    const profile = {
      browser: "Chromium",
      profileName: "PipelabConstruct",
      path: "/tmp/chromium/PipelabConstruct",
    };
    listChromiumBrowserProfiles.mockResolvedValue([profile]);

    const inspect = constructSource.inspect;
    if (!inspect) throw new Error("Expected Construct source inspection");

    const host = { platform: "linux", architecture: "x64" } as const;
    const first = await inspect({ path: "/project.c3p", profilePath: "" }, { host });
    const second = await inspect({ path: "/project.c3p", profilePath: profile.path }, { host });

    expect(listChromiumBrowserProfiles).toHaveBeenCalledTimes(2);
    expect(discoverBrowserProfiles).not.toHaveBeenCalled();
    expect(first.fieldOptions).toEqual(second.fieldOptions);
    expect(second.issues).toEqual([]);
  });

  it("blocks a selected profile that disappeared since it was listed", async () => {
    listChromiumBrowserProfiles.mockResolvedValue([]);
    isChromiumProfileDirectory.mockResolvedValue(false);

    const inspect = constructSource.inspect;
    if (!inspect) throw new Error("Expected Construct source inspection");
    const result = await inspect(
      { profilePath: "/tmp/chromium/removed-profile" },
      {
        host: { platform: "linux", architecture: "x64" },
      },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "construct.profile.unavailable",
        severity: "error",
        path: "profilePath",
      }),
    ]);
  });

  it("retains an existing custom profile outside the discovered browser roots", async () => {
    listChromiumBrowserProfiles.mockResolvedValue([]);
    isChromiumProfileDirectory.mockResolvedValue(true);

    const inspect = constructSource.inspect;
    if (!inspect) throw new Error("Expected Construct source inspection");
    const result = await inspect(
      { profilePath: "/opt/pipelab/construct-profile" },
      {
        host: { platform: "linux", architecture: "x64" },
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.fieldOptions?.profilePath).toContainEqual({
      label: "Custom / construct-profile",
      value: "/opt/pipelab/construct-profile",
    });
    expect(isChromiumProfileDirectory).toHaveBeenCalledWith("/opt/pipelab/construct-profile");
  });
});
