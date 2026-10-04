import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSteamLoginArgs,
  createSteamManualLoginCommand,
  createSteamUploadArgs,
  resolveSteamUsername,
} from "./upload-to-steam";
import plugin, { steamDestination, workflowTaskRunners } from "./index";

describe("Steam release credentials", () => {
  it("keeps its Release destination and task after removing legacy nodes", () => {
    expect(plugin.nodes).toEqual([]);
    expect(plugin.release?.destinations?.map((destination) => destination.id)).toContain(
      steamDestination.id,
    );
    expect(Object.keys(workflowTaskRunners)).toEqual(["@pipelab/plugin-steam/steam-upload"]);
  });

  it("reports destination field paths", () => {
    const issues = steamDestination.validate(
      {
        id: "destination",
        provider: steamDestination.id,
        enabled: true,
        config: {},
        slots: [{ id: "windows", name: "Windows build", enabled: true, config: {} }],
      },
      { host: { platform: "linux", architecture: "x64" } },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "config.accountConnectionId" }),
        expect.objectContaining({ path: "config.appId" }),
        expect.objectContaining({ path: "slots.windows.config.depotId" }),
      ]),
    );
    expect(issues.find((issue) => issue.code === "steam.depot.required")?.message).toBe(
      "Depot ID is required for Windows build.",
    );
  });

  it("resolves the account username by connection ID at execution time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pipelab-steam-"));
    const path = join(directory, "connections.json");
    await writeFile(
      path,
      JSON.stringify({
        connections: [{ id: "steam-1", email: "cached-user", password: "unused-password" }],
      }),
    );
    await expect(resolveSteamUsername(path, "steam-1")).resolves.toBe("cached-user");
  });

  it("rejects a selected connection with no account username", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pipelab-steam-"));
    const path = join(directory, "connections.json");
    await writeFile(path, JSON.stringify({ connections: [{ id: "steam-1", password: "unused" }] }));

    await expect(resolveSteamUsername(path, "steam-1")).rejects.toThrow(
      "Steam account connection has no username",
    );
  });

  it("logs in with the selected account and SteamCMD's cached credentials", () => {
    expect(createSteamLoginArgs("steam-user")).toEqual([
      "+@ShutdownOnFailedCommand",
      "1",
      "+@NoPromptForPassword",
      "1",
      "+login",
      "steam-user",
      "+quit",
    ]);
  });

  it("uses cached login credentials for Steam uploads without a password", () => {
    expect(createSteamUploadArgs("steam-user", "/tmp/app_build.vdf")).toEqual([
      "+@ShutdownOnFailedCommand",
      "1",
      "+@NoPromptForPassword",
      "1",
      "+login",
      "steam-user",
      "+run_app_build",
      "/tmp/app_build.vdf",
      "+quit",
    ]);
  });

  it("prints an absolute shell-safe command to refresh the same SteamCMD cache", () => {
    expect(
      createSteamManualLoginCommand(
        "/opt/pipelab/steamcmd/linux/steamcmd.sh",
        "steam-user",
        "linux",
      ),
    ).toBe(
      "cd '/opt/pipelab/steamcmd/linux' && '/opt/pipelab/steamcmd/linux/steamcmd.sh' +login 'steam-user' +quit",
    );
  });

  it("prints a PowerShell-compatible absolute login command on Windows", () => {
    expect(
      createSteamManualLoginCommand(
        "C:\\Pipelab SDK\\steamcmd\\steamcmd.exe",
        "steam-user",
        "win32",
      ),
    ).toBe(
      "Set-Location -LiteralPath 'C:\\Pipelab SDK\\steamcmd'; & 'C:\\Pipelab SDK\\steamcmd\\steamcmd.exe' '+login' 'steam-user' '+quit'",
    );
  });
});
