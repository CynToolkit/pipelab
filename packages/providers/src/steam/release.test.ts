import { describe, expect, it } from "vitest";
import {
  createSteamLoginArgs,
  createSteamManualLoginCommand,
  createSteamUploadArgs,
} from "./upload-to-steam";
import plugin, { createSteamUploadTask, steamDestination, WORKFLOW_TASK_ID } from "./index";

describe("Steam release credentials", () => {
  it("keeps its Release destination and task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.destinations?.map((destination) => destination.id)).toContain(
      steamDestination.id,
    );
    expect(createSteamUploadTask).toBeTypeOf("function");
    expect(WORKFLOW_TASK_ID).toBe("@pipelab/plugin-steam/steam-upload");
    expect(Object.keys(plugin.workflowTasks ?? {})).toEqual([WORKFLOW_TASK_ID]);
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
