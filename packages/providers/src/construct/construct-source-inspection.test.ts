import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

const profilePath = join(tmpdir(), "profile");
const chromiumProfilePath = join(tmpdir(), "chromium", "PipelabConstruct");

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
  it("compiles a workflow-scoped account alias without reading or storing process credentials", () => {
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    vi.stubEnv("CONSTRUCT_USERNAME", username);
    vi.stubEnv("CONSTRUCT_PASSWORD", password);

    try {
      const compiled = constructSource.compile(
        {
          path: "/project.c3p",
          profilePath,
          accountConnectionId: "construct-production",
          version: "",
        },
        {
          host: { platform: "linux", architecture: "x64" },
          getEnvironmentVariableStatus: () => ({ configured: false, nonEmpty: false }),
        },
      );
      const inputs = compiled.steps[0]?.with;

      expect(inputs).toMatchObject({ accountConnectionId: "construct-production" });
      expect(inputs).not.toHaveProperty("username");
      expect(inputs).not.toHaveProperty("password");
      expect(JSON.stringify(compiled)).not.toContain(username);
      expect(JSON.stringify(compiled)).not.toContain(password);
      expect(JSON.stringify(compiled)).not.toContain("CONSTRUCT_USERNAME");
      expect(JSON.stringify(compiled)).not.toContain("CONSTRUCT_PASSWORD");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps profile-only exports available when no account alias is configured", () => {
    vi.stubEnv("CONSTRUCT_USERNAME", undefined);
    vi.stubEnv("CONSTRUCT_PASSWORD", undefined);

    try {
      const compiled = constructSource.compile(
        { path: "/project.c3p", profilePath, version: "" },
        { host: { platform: "linux", architecture: "x64" } },
      );

      expect(compiled.steps[0]?.with).not.toHaveProperty("username");
      expect(compiled.steps[0]?.with).not.toHaveProperty("password");
      expect(compiled.steps[0]?.with).not.toHaveProperty("accountConnectionId");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lists local Chromium profiles without running full browser inspection", async () => {
    const profile = {
      browser: "Chromium",
      profileName: "PipelabConstruct",
      path: chromiumProfilePath,
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
      { profilePath: join(tmpdir(), "chromium", "removed-profile") },
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
