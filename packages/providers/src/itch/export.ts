import { dirname, delimiter } from "node:path";
import { readFile } from "node:fs/promises";
import { ensureButler } from "./ensure.js";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { WorkflowTask, WorkflowTaskContext } from "@pipelab/workflow-runtime";

export const WORKFLOW_TASK_ID = "@pipelab/plugin-itch/itch-upload";

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
  if (!response.ok)
    throw new Error(`Unable to resolve the Itch profile (HTTP ${response.status}).`);
  const data = (await response.json()) as { user?: { username?: string } };
  const username = data.user?.username;
  if (!username) throw new Error("The Itch account does not contain a username.");
  return username;
};

const redactApiKey = (value: string, apiKey: string): string =>
  apiKey ? value.split(apiKey).join("[REDACTED]") : value;

const sanitizeApiKeyError = (error: unknown, apiKey: string): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = redactApiKey(message, apiKey);
  if (error instanceof Error && sanitizedMessage === message) return error;

  const sanitizedError = new Error(sanitizedMessage);
  if (error instanceof Error) sanitizedError.name = error.name;
  return sanitizedError;
};

export type ButlerJSONOutput = ButlerJSONOutputLog | ButlerJSONOutputProgress;

export interface ItchTaskServices {
  context: PipelabContext;
}

export const createItchUploadTask =
  <TServices extends ItchTaskServices>(services: TServices): WorkflowTask<TServices> =>
  async (taskContext: WorkflowTaskContext<TServices>) => {
    const { context } = services;
    const { inputs, signal, log } = taskContext;
    const runtimeInputs = { ...inputs };
    const accountConnectionId = String(runtimeInputs.accountConnectionId || "").trim();
    if (accountConnectionId && (!runtimeInputs.user || !runtimeInputs["api-key"])) {
      const saved = JSON.parse(await readFile(context.getConnectionsPath(), "utf8")) as {
        connections?: Array<Record<string, unknown>>;
      };
      const connection = saved.connections?.find(
        (candidate) => candidate.id === accountConnectionId,
      );
      if (connection) {
        runtimeInputs.user = connection.user || connection.username || "";
        runtimeInputs["api-key"] = connection.apiKey || connection.api_key || "";
      }
    }
    const apiKey = typeof runtimeInputs["api-key"] === "string" ? runtimeInputs["api-key"] : "";
    const safeLog = (...args: unknown[]) =>
      log(
        ...args.map((value) => (typeof value === "string" ? redactApiKey(value, apiKey) : value)),
      );
    if (!runtimeInputs.user && apiKey) {
      try {
        runtimeInputs.user = await resolveItchUsername(apiKey);
      } catch (error) {
        throw sanitizeApiKeyError(error, apiKey);
      }
    }
    const node = context.getNodePath();
    const butlerPath = await ensureButler(context, "LATEST", safeLog);

    safeLog("Uploading to itch");

    await runWithLiveLogs(
      butlerPath,
      [
        "push",
        runtimeInputs["input-folder"] as string,
        `${runtimeInputs.user as string}/${runtimeInputs.project as string}:${runtimeInputs.channel as string}`,
        "--json",
      ],
      {
        env: {
          ...process.env,
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
          BUTLER_API_KEY: apiKey,
        },
        cancelSignal: signal,
      },
      safeLog,
      {
        onStdout(data) {
          const jsons = data.trim().split("\n");
          for (const jsonData of jsons) {
            const json = JSON.parse(jsonData) as ButlerJSONOutput;
            switch (json.type) {
              case "log":
                safeLog(json.message);
                break;
              case "progress":
                safeLog(`${json.progress}% - ETA: ${json.eta}s`);
                break;
            }
          }
        },
      },
    ).catch((error: unknown) => {
      throw sanitizeApiKeyError(error, apiKey);
    });

    safeLog("Uploaded to itch");
  };
