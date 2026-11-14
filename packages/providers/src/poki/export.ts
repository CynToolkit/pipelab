import { fetchPackage, runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { WorkflowTask, WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { dirname, join, delimiter, resolve } from "node:path";
import { writeFile, cp, readFile } from "node:fs/promises";
import { findPokiConfigRoot } from "./auth";
import type { ConnectionTestContext, PreflightContext, PreflightResult } from "@pipelab/shared";
import { failed, unverifiable, verified } from "../preflight";

const loginCommand = (account?: string) =>
  `pipelab settings integrations poki login${account ? ` ${account}` : ""}`;

const loginRequiredMessage = (account?: string) =>
  `Poki login is required${account ? ` for account '${account}'` : ""}. Run \`${loginCommand(account)}\` in an interactive terminal to sign in without uploading a build, then rerun this workflow.`;

export const WORKFLOW_TASK_ID = "@pipelab/plugin-poki/poki-upload";
export const POKI_CLI_VERSION = "0.1.19";

export interface PokiTaskServices {
  context: PipelabContext;
  executables: { node: string };
}

export const createPokiUploadTask =
  <TServices extends PokiTaskServices>(services: TServices): WorkflowTask<TServices> =>
  async (taskContext: WorkflowTaskContext<TServices>) => {
    const { context, executables } = services;
    const { inputs, signal, log } = taskContext;
    const node = executables.node;
    const thirdparty = context.getThirdPartyPath();

    const absoluteInputFolder = resolve(inputs["input-folder"] as string);

    log("Starting Poki upload action...");
    log(`- Game ID: ${inputs.project}`);
    log(`- Version name: ${inputs.name}`);
    log(`- Version notes: ${inputs.notes}`);
    log(`- Input folder: ${absoluteInputFolder}`);

    log(`Fetching @poki/cli version ${POKI_CLI_VERSION}...`);
    const { packageDir: pokiDir } = await fetchPackage("@poki/cli", POKI_CLI_VERSION, {
      context,
      installDeps: true,
    });
    const poki = join(pokiDir, "bin", "index.js");
    log(`Successfully resolved @poki/cli. Executable: ${poki}`);

    const tempUploadFolder = await context.createTempFolder("poki-upload-");
    log(`Created temporary upload root directory: ${tempUploadFolder}`);

    const tempDistFolder = join(tempUploadFolder, "dist");
    log(`Copying build files from "${absoluteInputFolder}" to "${tempDistFolder}"...`);
    await cp(absoluteInputFolder, tempDistFolder, {
      recursive: true,
    });

    const pokiJsonPath = join(tempUploadFolder, "poki.json");

    log(`Writing temporary poki.json configuration at: ${pokiJsonPath}`);
    const pokiConfig = {
      game_id: inputs.project,
      build_dir: "dist",
    };
    log(`poki.json configuration content:\n${JSON.stringify(pokiConfig, null, 2)}`);

    // create file at the same place the folder to upload
    await writeFile(pokiJsonPath, JSON.stringify(pokiConfig, undefined, 2), "utf-8");

    const accountConnectionId = String(inputs.accountConnectionId || "").trim();
    let account: string | undefined;
    if (accountConnectionId) {
      const values = taskContext.connectionValues[accountConnectionId];
      if (!values) {
        throw new Error(
          `Poki account Connection '${accountConnectionId}' was not resolved for this run.`,
        );
      }
      account = String(values.account || "").trim();
      if (!account) throw new Error("The Poki account Connection has no account name.");
    }
    const configRoot = await findPokiConfigRoot(thirdparty, account);

    if (!configRoot) {
      throw new Error(loginRequiredMessage(account));
    }

    log("Configuring environment variables:");
    log(`  - XDG_CONFIG_HOME: ${configRoot}`);
    log(`  - LOCALAPPDATA: ${configRoot}`);
    log(`  - PATH: ${dirname(node)}${delimiter}${process.env.PATH}`);
    log(`  - MSW_BRIDGE_PORT: ${process.env.MSW_BRIDGE_PORT || "not set"}`);
    log(`  - NODE_OPTIONS: ${process.env.NODE_OPTIONS || "not set"}`);

    const env: Record<string, string> = {
      ...process.env,
      XDG_CONFIG_HOME: configRoot,
      LOCALAPPDATA: configRoot,
      PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
    };

    log(
      `Running Poki CLI upload command: node ${poki} upload --name "${inputs.name}" --notes "${inputs.notes}"`,
    );

    let cliOutput = "";
    const captureCliOutput = (data: string) => {
      cliOutput += data;
      log(data);
    };

    try {
      await runWithLiveLogs(
        node,
        [poki, "upload", "--name", inputs.name as string, "--notes", inputs.notes as string],
        {
          cwd: tempUploadFolder,
          env,
          cancelSignal: signal,
        },
        log,
        {
          onStderr: captureCliOutput,
          onStdout: captureCliOutput,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message, { cause: error });
    }

    if (/\b401\b|\b403\b|unauthorized|invalid (?:developer )?token/i.test(cliOutput)) {
      throw new Error(
        `Poki rejected the cached authentication or denied access to this game. Run \`${loginCommand(account)}\` in an interactive terminal, then rerun this workflow.`,
      );
    }
    if (!cliOutput.includes("Version uploaded successfully")) {
      throw new Error(
        `Poki CLI exited without confirming that the upload succeeded. Check the CLI output above; run \`${loginCommand(account)}\` if authentication is missing, then rerun this workflow.`,
      );
    }

    /*
      {
        "game_id": "c7bfd2ba-e23b-486f-9504-a6f196cb44df",
        "build_dir": "dist"
      }
      npx @poki/cli upload --name "$(git rev-parse --short HEAD)" --notes "$(git log -1 --pretty=%B)"
    */

    log("Uploaded to poki");
  };

export interface PokiPreflightServices {
  context: PipelabContext;
}

/**
 * The one Poki account check, used by the run preflight and by the Connections test. The Poki CLI
 * offers no cheap whoami, so the check is that a login exists for the account. A missing login
 * fails a run's preflight, but only "cannot verify" when testing a connection, since the login can
 * follow saving it.
 */
export const verifyPokiAccount = async (
  account: string | undefined,
  services: PokiPreflightServices,
  loginMissing: "failed" | "unverifiable",
): Promise<PreflightResult> => {
  if (account === "") return failed("The Poki account Connection has no account name.");
  const root = await findPokiConfigRoot(services.context.getThirdPartyPath(), account);
  if (root) return verified();
  return loginMissing === "failed"
    ? failed(loginRequiredMessage(account))
    : unverifiable(loginRequiredMessage(account));
};

const POKI_API = "https://devs-api.poki.io";
const pokiHeaders = (authorization: string) => ({
  Authorization: authorization,
  "User-Agent": "poki-cli",
});

const readPokiAuth = async (root: string) => {
  for (const directory of ["poki", "Poki"]) {
    try {
      return JSON.parse(await readFile(join(root, directory, "auth.json"), "utf8")) as {
        access_token?: string;
        access_type?: string;
        refresh_token?: string;
      };
    } catch {
      // Try the other directory name.
    }
  }
  return undefined;
};

/**
 * Asks Poki whether the login can open the game, which is what an upload needs. A refreshed token is
 * only kept in memory: the check never writes the login file. Only a definitive "no access" fails.
 */
export const verifyPokiGame = async (
  root: string,
  gameId: string,
  signal?: AbortSignal,
): Promise<PreflightResult> => {
  if (!gameId) return failed("The Poki project is empty.");
  const auth = await readPokiAuth(root);
  if (!auth?.access_token) return unverifiable("The Poki login could not be read.");
  const scheme = auth.access_type ?? "Bearer";
  const timeout = AbortSignal.timeout(8_000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const open = (token: string) =>
    fetch(`${POKI_API}/games/${encodeURIComponent(gameId)}`, {
      headers: pokiHeaders(`${scheme} ${token}`),
      signal: abort,
    });
  try {
    let response = await open(auth.access_token);
    if (response.status === 401 && scheme !== "Token" && auth.refresh_token) {
      const refreshed = await fetch("https://auth.poki.io/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "poki-cli" },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
        signal: abort,
      });
      if (!refreshed.ok) return failed("Poki rejected the saved login. Sign in to Poki again.");
      const token = ((await refreshed.json()) as { access_token?: string }).access_token;
      if (!token) return unverifiable("Poki gave no refreshed login.");
      response = await open(token);
    }
    if (response.ok) return verified();
    if (response.status === 403 || response.status === 404) {
      return failed(
        `Poki denied access to game '${gameId}'. Use a game ID from your Poki for Developers account.`,
      );
    }
    return unverifiable(`Poki answered HTTP ${response.status}.`);
  } catch {
    return unverifiable("Poki could not be reached.");
  }
};

export const checkPokiPreflight = async ({
  inputs,
  connectionValues,
  services,
  signal,
}: PreflightContext<PokiPreflightServices>): Promise<PreflightResult> => {
  const alias = String(inputs.accountConnectionId || "").trim();
  const account = alias ? String(connectionValues[alias]?.account || "").trim() : undefined;
  const login = await verifyPokiAccount(account, services, "failed");
  if (login.status !== "verified") return login;
  const root = await findPokiConfigRoot(services.context.getThirdPartyPath(), account);
  if (!root) return login;
  return verifyPokiGame(root, String(inputs.project ?? "").trim(), signal);
};

export const testPokiConnection = async ({
  values,
  services,
}: ConnectionTestContext<PokiPreflightServices>): Promise<PreflightResult> =>
  verifyPokiAccount(String(values.account ?? "").trim(), services, "unverifiable");
