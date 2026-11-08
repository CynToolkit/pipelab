import AdmZip from "adm-zip";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { constructProducer } from "./producer";

const compileWebExport = (
  sourceConfig: Record<string, unknown>,
  context: Record<string, unknown> = {},
) =>
  constructProducer.compile(
    {
      reference: { stepId: "release-construct-source", artifact: "output" },
      descriptor: constructSource.output,
    },
    {
      id: "construct",
      provider: constructProducer.id,
      enabled: true,
      targets: [{ id: "web", enabled: true, config: {} }],
      config: {},
    },
    { host: { platform: "linux", architecture: "x64" }, sourceConfig, ...context },
  );

describe("Construct source inspection", () => {
  it("compiles a workflow-scoped account alias without reading or storing process credentials", () => {
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    vi.stubEnv("CONSTRUCT_USERNAME", username);
    vi.stubEnv("CONSTRUCT_PASSWORD", password);

    try {
      const compiled = compileWebExport(
        {
          path: "/project.c3p",
          profilePath,
          accountConnectionId: "construct-production",
          version: "",
        },
        {
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
      const compiled = compileWebExport({ path: "/project.c3p", profilePath, version: "" });

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

  it("offers keywords, with the project's saved release first when it can be read", async () => {
    listChromiumBrowserProfiles.mockResolvedValue([]);
    const inspect = constructSource.inspect;
    if (!inspect) throw new Error("Expected Construct source inspection");
    const host = { platform: "linux", architecture: "x64" } as const;

    const unreadable = await inspect(
      { path: join(tmpdir(), "missing.c3p"), profilePath: "" },
      { host },
    );
    expect(unreadable.fieldOptions?.version).toEqual([
      { label: "latest", value: "latest" },
      { label: "beta", value: "beta" },
    ]);

    const directory = await mkdtemp(join(tmpdir(), "pipelab-inspect-"));
    try {
      const archive = new AdmZip();
      archive.addFile("project.c3proj", Buffer.from(JSON.stringify({ savedWithRelease: 46602 })));
      const file = join(directory, "game.c3p");
      await writeFile(file, archive.toBuffer());

      const readable = await inspect({ path: file, profilePath: "" }, { host });
      expect(readable.fieldOptions?.version).toEqual([
        { label: "r466-2 · saved in project", value: "r466-2" },
        { label: "latest", value: "latest" },
        { label: "beta", value: "beta" },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
