import { dirname, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createAction,
  createActionRunner,
  createPasswordParam,
  createPathParam,
  createStringParam,
  ExternalCommandError,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { ensureSteamCmd } from "./ensure";

export const ID = "steam-upload";

const vdfValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ");

export const resolveSteamCredentials = async (connectionsPath: string, accountConnectionId: string, current: { username?: string; password?: string }): Promise<{ username: string; password: string }> => {
  if (current.username && current.password) return { username: current.username, password: current.password };
  const saved = JSON.parse(await readFile(connectionsPath, "utf8")) as { connections?: Array<Record<string, unknown>> };
  const connection = saved.connections?.find((candidate) => candidate.id === accountConnectionId);
  return { username: current.username || String(connection?.username || ""), password: current.password || String(connection?.password || "") };
};

export const uploadToSteam = createAction({
  id: ID,
  name: "Upload to Steam",
  description: "Upload your build directory directly to the Steamworks platform.",
  icon: "",
  displayString: "`Upload ${fmt.param(params['folder'], 'primary')} to steam`",
  meta: {},
  params: {
    username: createStringParam("", { required: true, label: "Username" }),
    password: createPasswordParam("", { required: true, label: "Password" }),
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
    let username = inputs.username as string;
    let password = inputs.password as string;
    if (runtimeInputs.accountConnectionId) ({ username, password } = await resolveSteamCredentials(context.getConnectionsPath(), runtimeInputs.accountConnectionId, { username, password }));
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

    let authChallenge = false;
    const streamLog = (data: string, subprocess?: { kill: () => void }) => {
      const lower = data.toLowerCase();
      if (
        ["steam guard", "two-factor", "password:", "login failure", "account login denied"].some(
          (text) => lower.includes(text),
        )
      ) {
        authChallenge = true;
        subprocess?.kill();
      }
      log("[steamcmd]", data);
    };

    try {
      await runWithLiveLogs(
        steamcmdPath,
        ["+login", username, password, "+run_app_build", appBuildPath, "+quit"],
        { cwd: dirname(steamcmdPath), shell: false },
        log,
        {
          onStdout: (data, subprocess) => streamLog(data, subprocess),
          onStderr: (data, subprocess) => streamLog(data, subprocess),
        },
        abortSignal,
      );
    } catch (error) {
      if (authChallenge)
        throw new Error("Steam authentication requires Steam Guard or interactive input");
      if (error instanceof ExternalCommandError) {
        if (error.code === 6)
          throw new Error(
            `Steam upload failed: depot ${depotId} could not connect to the content server`,
          );
        throw new Error(`SteamCMD upload failed (${error.code}): ${error.message}`);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }

    setOutput("status", "success");
    log("Done uploading");
  },
);
