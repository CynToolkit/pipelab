import { dirname, join, resolve, win32 as win32Path } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  ExternalCommandError,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { ensureSteamCmd } from "./ensure";

export const ID = "steam-upload";

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

export const uploadToSteam = createAction({
  id: ID,
  name: "Upload to Steam",
  description: "Upload your build directory directly to the Steamworks platform.",
  icon: "",
  displayString: "`Upload ${fmt.param(params['folder'], 'primary')} to steam`",
  meta: {},
  params: {
    appId: createStringParam("", { required: true, label: "App ID" }),
    depotId: createStringParam("", { required: true, label: "Depot ID" }),
    description: createStringParam("", { required: true, label: "Build Description" }),
    folder: createPathParam("", {
      required: true,
      label: "Folder to upload",
      control: { type: "path", options: { properties: ["openDirectory"] } },
    }),
  },
  outputs: {
    "script-path": { label: "Script path", value: "" },
    "output-folder": { label: "Output folder", value: "" },
    status: { label: "Status", value: "" },
  },
});

export const uploadToSteamRunner = createActionRunner<typeof uploadToSteam>(
  async ({ log, inputs, cwd, abortSignal, setOutput, context }) => {
    const runtimeInputs = inputs as typeof inputs & { accountConnectionId?: string };
    const folder = resolve(inputs.folder as string);
    const appId = inputs.appId as string;
    const depotId = inputs.depotId as string;
    const accountConnectionId = String(runtimeInputs.accountConnectionId || "").trim();
    if (!accountConnectionId) throw new Error("A Steam account connection is required");
    const username = await resolveSteamUsername(context.getConnectionsPath(), accountConnectionId);
    const description = inputs.description as string;

    if (!/^\d+$/.test(appId) || !/^\d+$/.test(depotId))
      throw new Error("Steam App ID and Depot ID must contain only digits");

    const steamcmdPath = await ensureSteamCmd(context, log, abortSignal);
    const steamDir = join(cwd, "steam");
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
      { encoding: "utf8", signal: abortSignal },
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
      { encoding: "utf8", signal: abortSignal },
    );

    setOutput("script-path", appBuildPath);
    setOutput("output-folder", buildOutput);

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
        abortSignal,
      );

    try {
      authPrompt = false;
      await runSteamCommand(createSteamLoginArgs(username));
      if (authPrompt) throw new Error("SteamCMD requires an interactive login");
    } catch (error) {
      if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError"))
        throw error;
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
      if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError"))
        throw error;
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

    setOutput("status", "success");
    log("Done uploading");
  },
);
