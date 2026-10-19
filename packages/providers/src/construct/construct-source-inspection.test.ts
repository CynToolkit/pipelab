import { describe, expect, it, vi } from "vitest";
import { normalize } from "node:path";

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
  it("binds credentials to runtime environment references without embedding their values", () => {
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    vi.stubEnv("CONSTRUCT_USERNAME", username);
    vi.stubEnv("CONSTRUCT_PASSWORD", password);

    try {
      const compiled = constructSource.compile(
        { path: "/project.c3p", profilePath: "/tmp/profile", version: "" },
        { host: { platform: "linux", architecture: "x64" } },
      );
      const inputs = compiled.steps[0]?.with;

      expect(inputs).toMatchObject({
        username: "${{ env.CONSTRUCT_USERNAME }}",
        password: "${{ env.CONSTRUCT_PASSWORD }}",
      });
      expect(JSON.stringify(compiled)).not.toContain(username);
      expect(JSON.stringify(compiled)).not.toContain(password);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("leaves profile-only exports unchanged when no Construct credentials are configured", () => {
    vi.stubEnv("CONSTRUCT_USERNAME", undefined);
    vi.stubEnv("CONSTRUCT_PASSWORD", undefined);

    try {
      const compiled = constructSource.compile(
        { path: "/project.c3p", profilePath: "/tmp/profile", version: "" },
        { host: { platform: "linux", architecture: "x64" } },
      );

      expect(compiled.steps[0]?.with).not.toHaveProperty("username");
      expect(compiled.steps[0]?.with).not.toHaveProperty("password");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["username", "construct-user@example.test", undefined],
    ["password", undefined, "construct-password-secret"],
  ])("rejects a configured Construct %s without its pair", (_credential, username, password) => {
    vi.stubEnv("CONSTRUCT_USERNAME", username);
    vi.stubEnv("CONSTRUCT_PASSWORD", password);

    try {
      expect(() =>
        constructSource.compile(
          { path: "/project.c3p", profilePath: "/tmp/profile", version: "" },
          { host: { platform: "linux", architecture: "x64" } },
        ),
      ).toThrow("Set both CONSTRUCT_USERNAME and CONSTRUCT_PASSWORD, or unset both");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["username", "", "construct-password-secret"],
    ["password", "construct-user@example.test", ""],
  ])("rejects an empty Construct %s", (_credential, username, password) => {
    vi.stubEnv("CONSTRUCT_USERNAME", username);
    vi.stubEnv("CONSTRUCT_PASSWORD", password);

    try {
      expect(() =>
        constructSource.compile(
          { path: "/project.c3p", profilePath: "/tmp/profile", version: "" },
          { host: { platform: "linux", architecture: "x64" } },
        ),
      ).toThrow("Both credential values must be non-empty");
    } finally {
      vi.unstubAllEnvs();
    }
  });

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
    const customProfilePath = normalize("/opt/pipelab/construct-profile");

    const inspect = constructSource.inspect;
    if (!inspect) throw new Error("Expected Construct source inspection");
    const result = await inspect(
      { profilePath: customProfilePath },
      {
        host: { platform: "linux", architecture: "x64" },
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.fieldOptions?.profilePath).toContainEqual({
      label: "Custom / construct-profile",
      value: customProfilePath,
    });
    expect(isChromiumProfileDirectory).toHaveBeenCalledWith(customProfilePath);
  });
});
