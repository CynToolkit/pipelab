import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  fetchPackage,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { dirname, join, delimiter, resolve } from "node:path";
import { writeFile, cp, access } from "node:fs/promises";

export const ID = "poki-upload";
export const POKI_CLI_VERSION = "0.1.19";

export const uploadToPoki = createAction({
  id: ID,
  name: "Upload to Poki",
  description: "Upload and publish your build to the Poki Developer Portal.",
  icon: "",
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to Poki game ID ${fmt.param(params['project'], 'primary', 'No project')} (${fmt.param(params['name'], 'primary', 'No version name')})`",
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
    project: createStringParam("", {
      required: true,
      label: "Poki Game ID",
      description: "Your unique Poki game ID.",
    }),
    name: createStringParam("", {
      required: true,
      label: "Version name",
      description: "The version label for this build.",
    }),
    notes: createStringParam("", {
      required: true,
      label: "Version notes",
      description: "Release notes describing the changes in this version.",
    }),
  },
  outputs: {},
});

export const uploadToPokiRunner = createActionRunner<typeof uploadToPoki>(
  async ({ log, inputs, paths, abortSignal, context }) => {
    const { node, thirdparty } = paths;

    const absoluteInputFolder = resolve(inputs["input-folder"] as string);

    const sandboxConfigDir = thirdparty;

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

    const authPaths = [
      join(sandboxConfigDir, "poki", "auth.json"),
      join(sandboxConfigDir, "Poki", "auth.json"),
    ];
    let authFileFound = false;
    for (const authPath of authPaths) {
      try {
        await access(authPath);
        authFileFound = true;
        break;
      } catch {}
    }

    if (!authFileFound) {
      throw new Error(
        "Poki login is required. Run `pipelab settings integrations poki login` in an interactive terminal to sign in without uploading a build, then rerun this workflow.",
      );
    }

    log("Configuring environment variables:");
    log(`  - XDG_CONFIG_HOME: ${sandboxConfigDir}`);
    log(`  - LOCALAPPDATA: ${sandboxConfigDir}`);
    log(`  - PATH: ${dirname(node)}${delimiter}${process.env.PATH}`);
    log(`  - MSW_BRIDGE_PORT: ${process.env.MSW_BRIDGE_PORT || "not set"}`);
    log(`  - NODE_OPTIONS: ${process.env.NODE_OPTIONS || "not set"}`);

    const env: Record<string, string> = {
      ...process.env,
      XDG_CONFIG_HOME: sandboxConfigDir,
      LOCALAPPDATA: sandboxConfigDir,
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
          cancelSignal: abortSignal,
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
        "Poki rejected the cached authentication or denied access to this game. Run `pipelab settings integrations poki login` in an interactive terminal, then rerun this workflow.",
      );
    }
    if (!cliOutput.includes("Version uploaded successfully")) {
      throw new Error(
        "Poki CLI exited without confirming that the upload succeeded. Check the CLI output above; run `pipelab settings integrations poki login` if authentication is missing, then rerun this workflow.",
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
  },
);
