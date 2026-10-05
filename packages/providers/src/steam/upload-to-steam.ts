import { dirname, join, resolve, win32 as win32Path } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ExternalCommandError, runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { WorkflowTask, WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { ensureSteamCmd } from "./ensure";

export const WORKFLOW_TASK_ID = "@pipelab/plugin-steam/steam-upload";

export const createSteamLoginArgs = (username: string): string[] => [
  "+@ShutdownOnFailedCommand",
  "1",
  "+@NoPromptForPassword",
  "1",
  "+login",
  username,
  "+quit",
];

export const createSteamUploadArgs = (username: string, appBuildPath: string): string[] => [
  "+@ShutdownOnFailedCommand",
  "1",
  "+@NoPromptForPassword",
  "1",
  "+login",
  username,
  "+run_app_build",
  appBuildPath,
  "+quit",
];

const quotePosix = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export const createSteamManualLoginCommand = (
  steamcmdPath: string,
  username: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  const pathApi = platform === "win32" ? win32Path : { resolve, dirname };
  const absolutePath = pathApi.resolve(steamcmdPath);
  const workingDirectory = pathApi.dirname(absolutePath);

  if (platform === "win32") {
    const quotePowerShell = (value: string) => `'${value.replace(/'/g, "''")}'`;
    return `Set-Location -LiteralPath ${quotePowerShell(workingDirectory)}; & ${quotePowerShell(absolutePath)} '+login' ${quotePowerShell(username)} '+quit'`;
  }

  return `cd ${quotePosix(workingDirectory)} && ${quotePosix(absolutePath)} +login ${quotePosix(username)} +quit`;
};

const vdfValue = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, " ");

export const resolveSteamUsername = async (
  connectionsPath: string,
  accountConnectionId: string,
): Promise<string> => {
  const saved = JSON.parse(await readFile(connectionsPath, "utf8")) as {
    connections?: Array<Record<string, unknown>>;
  };
  const connection = saved.connections?.find((candidate) => candidate.id === accountConnectionId);
  const username = String(connection?.username || connection?.email || "").trim();
  if (!username) throw new Error("Steam account connection has no username");
  return username;
};

export interface SteamTaskServices {
  context: PipelabContext;
}

export const createSteamUploadTask =
  <TServices extends SteamTaskServices>(services: TServices): WorkflowTask<TServices> =>
  async (taskContext: WorkflowTaskContext<TServices>) => {
    const { context } = services;
    const { log, inputs, workspace, signal } = taskContext;
    const folder = resolve(inputs.folder as string);
    const appId = inputs.appId as string;
    const depotId = inputs.depotId as string;
    const accountConnectionId = String(inputs.accountConnectionId || "").trim();
    if (!accountConnectionId) throw new Error("A Steam account connection is required");
    const username = await resolveSteamUsername(context.getConnectionsPath(), accountConnectionId);
    const description = inputs.description as string;

    if (!/^\d+$/.test(appId) || !/^\d+$/.test(depotId))
      throw new Error("Steam App ID and Depot ID must contain only digits");

    const steamcmdPath = await ensureSteamCmd(context, log, signal);
    const steamDir = join(workspace.root, "steam");
    const buildOutput = join(steamDir, "output");
    const appBuildPath = join(steamDir, "app_build.vdf");
    const depotBuildPath = join(steamDir, `depot_build_${depotId}.vdf`);
    const depotBuildName = `depot_build_${depotId}.vdf`;

    await mkdir(steamDir, { recursive: true });
    await mkdir(buildOutput, { recursive: true });
    await writeFile(
      appBuildPath,
      `"AppBuild"
{
  "AppID" "${vdfValue(appId)}"
  "Desc" "${vdfValue(description)}"
  "ContentRoot" "${vdfValue(folder)}"
  "BuildOutput" "${vdfValue(resolve(buildOutput))}"
  "Depots"
  {
    "${vdfValue(depotId)}" "${depotBuildName}"
  }
}
`,
      { encoding: "utf8", signal },
    );
    await writeFile(
      depotBuildPath,
      `"DepotBuild"
{
  "DepotID" "${vdfValue(depotId)}"
  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "Recursive" "1"
  }
}
`,
      { encoding: "utf8", signal },
    );

    const outputs = { "script-path": appBuildPath, "output-folder": buildOutput };

    let authPrompt = false;
    const streamLog = (data: string, subprocess?: { kill: () => void }) => {
      const lower = data.toLowerCase();
      if (
        [
          "cached credentials not found",
          "steam guard",
          "two-factor",
          "password:",
          "login failure",
          "account login denied",
          "failed to login",
        ].some((text) => lower.includes(text))
      ) {
        authPrompt = true;
        subprocess?.kill();
      }
      log("[steamcmd]", data);
    };

    const workingDirectory = dirname(steamcmdPath);
    const manualLoginCommand = createSteamManualLoginCommand(steamcmdPath, username);
    const runSteamCommand = (args: string[]) =>
      runWithLiveLogs(
        steamcmdPath,
        args,
        { cwd: workingDirectory, shell: false },
        log,
        {
          onStdout: (data, subprocess) => streamLog(data, subprocess),
          onStderr: (data, subprocess) => streamLog(data, subprocess),
        },
        signal,
      );

    try {
      authPrompt = false;
      await runSteamCommand(createSteamLoginArgs(username));
      if (authPrompt) throw new Error("SteamCMD requires an interactive login");
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SteamCMD could not reuse the saved login for ${username}. Run this command in a terminal to authenticate the same SteamCMD installation, then retry:\n\n${manualLoginCommand}\n\n${reason}`,
      );
    }

    try {
      authPrompt = false;
      await runSteamCommand(createSteamUploadArgs(username, appBuildPath));
      if (authPrompt) throw new Error("SteamCMD requires an interactive login");
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      if (authPrompt) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `SteamCMD lost the saved login for ${username}. Run this command in a terminal to authenticate the same SteamCMD installation, then retry:\n\n${manualLoginCommand}\n\n${reason}`,
        );
      }
      if (error instanceof ExternalCommandError && error.code === 6)
        throw new Error(
          `Steam upload failed: depot ${depotId} could not connect to the content server`,
        );
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SteamCMD upload failed: ${message}`);
    }

    log("Done uploading");
    return { ...outputs, status: "success" };
  };
