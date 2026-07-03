import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  fetchPackage,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { dirname, join, delimiter, resolve, relative } from "node:path";
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
  async ({ log, inputs, paths, abortSignal, cwd, context }) => {
    const { node, thirdparty, pnpm, userData } = paths;

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
    await writeFile(
      pokiJsonPath,
      JSON.stringify(pokiConfig, undefined, 2),
      "utf-8",
    );

    // Direct Poki CLI to read/write credentials inside Pipelab's thirdparty folder
    const sandboxConfigDir = thirdparty;

    log("Checking for sandboxed authentication credentials...");
    const possibleAuthPaths = [
      join(sandboxConfigDir, "poki", "auth.json"),
      join(sandboxConfigDir, "Poki", "auth.json"),
    ];
    let authFileFound = false;
    let foundPath = "";
    for (const p of possibleAuthPaths) {
      try {
        await access(p);
        authFileFound = true;
        foundPath = p;
        break;
      } catch {}
    }

    if (authFileFound) {
      log(`[Poki] Authentication file found at: ${foundPath}`);
    } else {
      log("[Poki] [WARNING] No authentication file (auth.json) found in the sandboxed config directory.");
      log("[Poki] [WARNING] Poki CLI might try to open a browser for interactive login, which could hang/fail in headless environments.");
      log(`[Poki] Expected location: ${join(sandboxConfigDir, "poki", "auth.json")} or ${join(sandboxConfigDir, "Poki", "auth.json")}`);
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

    log(`Running Poki CLI upload command: node ${poki} upload --name "${inputs.name}" --notes "${inputs.notes}"`);

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
        onStderr(data, subprocess) {
          log(data);
        },
        onStdout(data, subprocess) {
          log(data);
        },
      },
    );

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
