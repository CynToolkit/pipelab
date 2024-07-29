import { createAction, createActionRunner } from "@cyn/plugin-core";

export const FLOW_INPUT_ID = "steam-flow-input";
export const FLOW_OUTPUT_ID = "steam-flow-output";

export const ID = "steam-upload";

export const uploadToSteam = createAction({
  id: ID,
  name: "Upload to Steam",
  description: "Upload a folder to Steam",
  icon: "",
  displayString: "`Upload ${params.folder} to steam`",
  meta: {},
  params: {
    sdk: {
      value: "",
      label: "Steam Sdk path",
      control: {
        type: "path",
        options: {
          properties: ['openDirectory']
        }
      },
    },
    username: {
      value: "",
      label: "Steam username",
      control: {
        type: "input",
        options: {
          kind: "text",
        },
      },
    },
    appId: {
      value: "",
      label: "App Id",
      control: {
        type: "input",
        options: {
          kind: "text",
        },
      },
    },
    depotId: {
      value: "",
      label: "Depot Id",
      control: {
        type: "input",
        options: {
          kind: "text",
        },
      },
    },
    folder: {
      value: "",
      label: "Folder to upload",
      control: {
        type: "path",
        options: {
          properties: ['openDirectory']
        }
      },
    },
  },
  outputs: {},
});

export const uploadToSteamRunner = createActionRunner<typeof uploadToSteam>(
  async ({ log, inputs, cwd }) => {
    const { join, dirname } = await import("path");
    const { platform } = await import("os");
    const { chmod, mkdir, writeFile } = await import("fs/promises");
    const { execa, execaCommand } = await import("execa");

    log("uploading to steam");
    const { folder, appId, sdk, depotId, username } = inputs;

    log("folder", folder);

    const buildOutput = join(cwd, "steam", "output");
    const scriptPath = join(cwd, "steam", "script.vdf");

    await mkdir(buildOutput, {
      recursive: true,
    })

    await mkdir(dirname(scriptPath), {
      recursive: true,
    })

    const script = `"AppBuild"
{
	"AppID" "${appId}" // your AppID
	"Desc" "This is a simple build script" // internal description for this build

	"ContentRoot" "${folder}" // root content folder, relative to location of this file
	"BuildOutput" "${buildOutput}" // build output folder for build logs and build cache files

	"Depots"
	{
		"${depotId}" // your DepotID
		{
			"FileMapping"
			{
				"LocalPath" "*" // all files from contentroot folder
				"DepotPath" "." // mapped into the root of the depot
				"recursive" "1" // include all subfolders
			}
		}
	}
}`;

    log("script", script);

    let builderFolder = 'builder'
    if (platform() === 'linux') {
      builderFolder += '_linux'
    } else if (platform() === 'darwin') {
      builderFolder += "_osx"
    }

    let cmd = "steamcmd";
    if (platform() === "linux") {
      cmd += ".sh";
    } else if (platform() === "darwin") {
      cmd += ".sh";
    } else if (platform() === "win32") {
      cmd += ".exe";
    }

    const steamcmdPath = join(sdk, 'tools', 'ContentBuilder', builderFolder, cmd);

    log('steamcmdPath', steamcmdPath)

    if (platform() === "linux" || platform() === "darwin") {
      log('Adding "execute" permissions')
      await chmod(steamcmdPath, 0o755)
    }

    log('Writing script')
    await writeFile(scriptPath, script, 'utf8')

    log('Executing steamcmd')
    await execa(steamcmdPath, ["+login", username, "+run_app_build", scriptPath, '+quit'], {
      stdout: 'inherit',
      stderr: 'inherit'
    })
    log('Done uploading')
  }
);
