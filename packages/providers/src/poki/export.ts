import { fetchPackage, runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { WorkflowTask, WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { dirname, join, delimiter, resolve } from "node:path";
import { writeFile, cp } from "node:fs/promises";
import { findPokiConfigRoot } from "./auth";

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
