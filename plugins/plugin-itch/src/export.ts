import { dirname, delimiter } from "node:path";
import { readFile } from "node:fs/promises";
import { ensureButler } from "./ensure.js";
import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  runWithLiveLogs,
} from "@pipelab/plugin-core";

export const ID = "itch-upload";

export interface ButlerJSONOutputLog {
  level: "info";
  message: string;
  time: number;
  type: "log";
}

export interface ButlerJSONOutputProgress {
  bps: number;
  eta: number;
  progress: number;
  time: 1736873335;
  type: "progress";
}

export const resolveItchUsername = async (apiKey: string): Promise<string> => {
  const response = await fetch(`https://itch.io/api/1/${encodeURIComponent(apiKey)}/me`);
  if (!response.ok) throw new Error(`Unable to resolve the Itch profile (HTTP ${response.status}).`);
  const data = await response.json() as { user?: { username?: string } };
  const username = data.user?.username;
  if (!username) throw new Error("The Itch account does not contain a username.");
  return username;
};

export type ButlerJSONOutput = ButlerJSONOutputLog | ButlerJSONOutputProgress;

export const uploadToItch = createAction({
  id: ID,
  name: "Upload to Itch.io",
  description: "Upload your build directory to Itch.io.",
  icon: "",
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to ${fmt.param(params['user'], 'primary', 'No project')}/${fmt.param(params['project'], 'primary', 'No project')}:${fmt.param(params['channel'], 'primary', 'No channel')}`",
  meta: {},
  params: {
    "input-folder": createPathParam("", {
      required: true,
      label: "Folder to upload",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
    }),
    user: createStringParam("", {
      required: true,
      label: "Username",
    }),
    project: createStringParam("", {
      required: true,
      label: "Project",
    }),
    channel: createStringParam("", {
      required: true,
      label: "Channel (e.g., windows, mac, web)",
    }),
    "api-key": createStringParam("", {
      required: true,
      label: "API Key",
    }),
  },
  outputs: {},
});

export const uploadToItchRunner = createActionRunner<typeof uploadToItch>(
  async ({ log, inputs, abortSignal, context }) => {
    const runtimeInputs = inputs as typeof inputs & { accountConnectionId?: string };
    if (runtimeInputs.accountConnectionId && (!inputs.user || !inputs["api-key"])) {
      const saved = JSON.parse(await readFile(context.getConnectionsPath(), "utf8")) as { connections?: Array<Record<string, unknown>> };
      const connection = saved.connections?.find((candidate) => candidate.id === runtimeInputs.accountConnectionId);
      if (connection) {
        (inputs as Record<string, unknown>).user = connection.user || connection.username || "";
        (inputs as Record<string, unknown>)["api-key"] = connection.apiKey || connection.api_key || "";
      }
    }
    if (!inputs.user && inputs["api-key"]) (inputs as Record<string, unknown>).user = await resolveItchUsername(String(inputs["api-key"]));
    const node = context.getNodePath();
    const butlerPath = await ensureButler(context);

    log("Uploading to itch");

    await runWithLiveLogs(
      butlerPath,
      [
        "push",
        inputs["input-folder"] as string,
        `${inputs.user as string}/${inputs.project as string}:${inputs.channel as string}`,
        "--json",
      ],
      {
        env: {
          ...process.env,
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
          BUTLER_API_KEY: inputs["api-key"] as string,
        },
        cancelSignal: abortSignal,
      },
      log,
      {
        onStdout(data) {
          const jsons = data.trim().split("\n");
          for (const jsonData of jsons) {
            const json = JSON.parse(jsonData) as ButlerJSONOutput;
            switch (json.type) {
              case "log":
                log(json.message);
                break;
              case "progress":
                log(`${json.progress}% - ETA: ${json.eta}s`);
                break;
            }
          }
        },
      },
    );

    log("Uploaded to itch");
  },
);
