import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { dirname, join, delimiter } from "node:path";
import { writeFile, cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";

export const ID = "poki-upload";

export const uploadToPoki = createAction({
  id: ID,
  name: "Upload to Poki.io",
  description: "",
  icon: "",
  displayString:
    "`Upload ${fmt.param(params['input-folder'], 'primary', 'No path selected')} to ${fmt.param(params['project'], 'primary', 'No project')} poki game (${fmt.param(params['name'], 'primary', 'No version name')})`",
  meta: {},
  params: {
    "input-folder": createPathParam("", {
      required: true,
      label: "Folder to Upload",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
    }),
    project: createStringParam("", {
      required: true,
      label: "Project",
      description: "This is you Poki game id",
    }),
    name: createStringParam("", {
      required: true,
      label: "Version name",
      description: "This is the name of the version",
    }),
    notes: createStringParam("", {
      required: true,
      label: "Version notes",
      description: "These are notes you want to specify with  your version",
    }),
  },
  outputs: {},
});

export const uploadToPokiRunner = createActionRunner<typeof uploadToPoki>(
  async ({ log, inputs, paths, abortSignal, cwd }) => {
    const { ensureNPMPackage } = await import("@pipelab/plugin-core");

    const { node, thirdparty, pnpm } = paths;
    const pokiDir = await ensureNPMPackage(thirdparty, "@poki/cli", "1.0.0", {
      nodePath: node,
      pnpmPath: pnpm,
      installDeps: true,
    });
    const poki = join(pokiDir, "bin", "index.js");

    const dist = join(cwd, "dist");

    await mkdir(dist, { recursive: true });
    await cp(inputs["input-folder"] as string, dist, {
      recursive: true,
    });

    const pokiJsonPath = join(cwd, "poki.json");

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

    // TODO: needs auth

    await runWithLiveLogs(
      node,
      [poki, "upload", "--name", inputs.name as string, "--notes", inputs.notes as string],
      {
        cwd,
        env: {
          // DEBUG: '*',
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
        },
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
