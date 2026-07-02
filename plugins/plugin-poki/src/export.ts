import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  fetchPackage,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { dirname, join, delimiter } from "node:path";
import { writeFile, cp, mkdir } from "node:fs/promises";

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
    const { packageDir: pokiDir } = await fetchPackage("@poki/cli", POKI_CLI_VERSION, {
      context,
      installDeps: true,
    });
    const poki = join(pokiDir, "bin", "index.js");

    const dist = join(cwd, "dist");

    await mkdir(dist, { recursive: true });
    await cp(inputs["input-folder"] as string, dist, {
      recursive: true,
    });

    const pokiJsonPath = join(cwd, "poki.json");

    console.log("pokiJsonPath", pokiJsonPath);

    // create file at the same place the folder to upload
    await writeFile(
      pokiJsonPath,
      JSON.stringify(
        {
          game_id: inputs.project,
          build_dir: "dist",
        },
        undefined,
        2,
      ),
      "utf-8",
    );

    log("process.env.MSW_BRIDGE_PORT", process.env.MSW_BRIDGE_PORT);
    log("process.env.NODE_OPTIONS", process.env.NODE_OPTIONS);

    // Direct Poki CLI to read/write credentials inside Pipelab's thirdparty folder
    const sandboxConfigDir = thirdparty;

    const env: Record<string, string> = {
      ...process.env,
      XDG_CONFIG_HOME: sandboxConfigDir,
      LOCALAPPDATA: sandboxConfigDir,
      PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
    };

    await runWithLiveLogs(
      node,
      [poki, "upload", "--name", inputs.name as string, "--notes", inputs.notes as string],
      {
        cwd,
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
