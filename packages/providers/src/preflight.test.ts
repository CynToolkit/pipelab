import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkItchPreflight } from "./itch/export";
import { checkPokiPreflight } from "./poki/export";
import { checkSteamPreflight } from "./steam/preflight";

const itchContext = (apiKey = "key") => ({
  inputs: { accountConnectionId: "acct" },
  connectionValues: { acct: { apiKey } },
  services: undefined,
});

describe("Itch preflight", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies an accepted key", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ user: { username: "me" } }));
    expect(await checkItchPreflight(itchContext())).toEqual({ status: "verified" });
  });

  it("fails a rejected key without echoing it", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ errors: ["invalid key"] }));
    const result = await checkItchPreflight(itchContext("super-secret"));
    expect(result).toEqual({ status: "failed", message: "The Itch API key was rejected." });
  });

  it("does not block on network trouble or server errors", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect((await checkItchPreflight(itchContext())).status).toBe("unverifiable");
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    expect((await checkItchPreflight(itchContext())).status).toBe("unverifiable");
  });
});

describe("Poki and Steam preflight", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "preflight-"));
    vi.stubEnv("XDG_CONFIG_HOME", join(root, "empty"));
    vi.stubEnv("LOCALAPPDATA", join(root, "empty"));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  const services = (thirdParty: string) => ({
    context: { getThirdPartyPath: (...parts: string[]) => join(thirdParty, ...parts) },
  });

  it("fails Poki without a login and verifies once one exists", async () => {
    const context = {
      inputs: {},
      connectionValues: {},
      services: services(join(root, "thirdparty")) as never,
    };
    expect((await checkPokiPreflight(context)).status).toBe("failed");
    await mkdir(join(root, "empty", "poki"), { recursive: true });
    await writeFile(join(root, "empty", "poki", "auth.json"), "{}");
    expect(await checkPokiPreflight(context)).toEqual({ status: "verified" });
  });

  it("checks only SteamCMD's saved accounts", async () => {
    const thirdParty = join(root, "thirdparty");
    const context = {
      inputs: { accountConnectionId: "acct" },
      connectionValues: { acct: { username: "Studio" } },
      services: services(thirdParty) as never,
    };
    vi.stubEnv("HOME", join(root, "home"));
    expect((await checkSteamPreflight(context)).status).toBe("unverifiable");

    const configDir = join(thirdParty, "steamcmd", process.platform, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.vdf"), '"Accounts"\n{\n\t"other"\n\t{\n\t}\n}\n');
    expect((await checkSteamPreflight(context)).status).toBe("failed");
    await writeFile(join(configDir, "config.vdf"), '"Accounts"\n{\n\t"studio"\n\t{\n\t}\n}\n');
    expect(await checkSteamPreflight(context)).toEqual({ status: "verified" });
  });
});
