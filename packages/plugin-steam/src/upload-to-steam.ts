import { join, dirname, basename } from "node:path";
import { platform } from "node:os";
import { chmod, mkdir, writeFile, cp } from "node:fs/promises";
import {
  createAction,
  createActionRunner,
  createPathParam,
  createStringParam,
  fileExists,
  runWithLiveLogsPTY,
} from "@pipelab/plugin-core";
import { checkSteamAuth, openExternalTerminal } from "./utils";
import { ExternalCommandError } from "@pipelab/plugin-core";

// https://github.com/ztgasdf/steampkg?tab=readme-ov-file#account-management

// How to login
// Do it at least once
// sdk/tools/ContentBuilder/builder_linux/steamcmd.sh +login User +quit

export const ID = "steam-upload";

export const uploadToSteam = createAction({
  id: ID,
  name: "Upload to Steam",
  description: "Upload a folder to Steam",
  icon: "",
  displayString: "`Upload ${fmt.param(params['folder'], 'primary')} to steam`",
  meta: {},
  params: {
    sdk: createPathParam("", {
      required: true,
      label: "Steam Sdk path",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
    }),
    username: createStringParam("", {
      required: true,
      label: "Steam username",
    }),
    appId: createStringParam("", {
      required: true,
      label: "App Id",
    }),
    depotId: createStringParam("", {
      required: true,
      label: "Depot Id",
    }),
    description: createStringParam("", {
      required: true,
      label: "Description",
    }),
    folder: createPathParam("", {
      required: true,
      label: "Folder to upload",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
    }),
    // enableDRM: {
    //   value: false,
    //   label: 'Enable DRM',
    //   control: {
    //     type: 'boolean'
    //   }
    // },
    // binaryToPatch: createPathParam('', {
    //   label: 'Binary to patch',
    //   control: {
    //     type: 'path',
    //     options: {
    //       properties: ['openFile']
    //     }
    //   }
    // })
  },
  outputs: {
    "script-path": {
      label: "Script path",
      value: "",
    },
    "output-folder": {
      label: "Output folder",
      value: "",
    },
    "status": {
      label: "Status",
      value: "",
    },
  },
});

export const uploadToSteamRunner = createActionRunner<typeof uploadToSteam>(
  async ({ log, inputs, cwd, abortSignal, setOutput }) => {
    const folder = inputs.folder as string;
    const appId = inputs.appId as string;
    const sdk = inputs.sdk as string;
    const depotId = inputs.depotId as string;
    const username = inputs.username as string;
    const description = inputs.description as string;

    log(`uploading "${folder}" to steam`);

    const errorMap = {
      6: `No connection to content server. Your depot id (${depotId}) may be invalid`,
    };

    const isSDKExisting = await fileExists(sdk);
    if (!isSDKExisting) {
      throw new Error(`You must enter a valid path to the Steam SDK`);
    }

    let builderFolder = "builder";
    if (platform() === "linux") {
      builderFolder += "_linux";
    } else if (platform() === "darwin") {
      builderFolder += "_osx";
    }

    const cmd = "steamcmd";
    let cmdFinal = "steamcmd";
    if (platform() === "linux") {
      cmdFinal += ".sh";
    } else if (platform() === "darwin") {
      cmdFinal += ".sh";
    } else if (platform() === "win32") {
      cmdFinal += ".exe";
    }

    const steamcmdPath = join(sdk as string, "tools", "ContentBuilder", builderFolder, cmdFinal);

    console.log("steamcmdPath", steamcmdPath);

    if (platform() === "linux" || platform() === "darwin") {
      if (platform() === "linux") {
        log('Adding "execute" permissions to linux binary');
        const steamcmdBinaryPath = join(
          sdk,
          "tools",
          "ContentBuilder",
          builderFolder,
          "linux32",
          cmd,
        );
        await chmod(steamcmdBinaryPath, 0o755);
        const steamcmdBinaryErrorReporterPath = join(
          sdk,
          "tools",
          "ContentBuilder",
          builderFolder,
          "linux32",
          "steamerrorreporter",
        );
        await chmod(steamcmdBinaryErrorReporterPath, 0o755);
      }

      if (platform() === "darwin") {
        const steamcmdBinaryPath = join(sdk, "tools", "ContentBuilder", builderFolder, cmd);
        log('Adding "execute" permissions to darwin binary');
        await chmod(steamcmdBinaryPath, 0o755);
      }

      log('Adding "execute" permissions to binary');
      await chmod(steamcmdPath, 0o755);
    }

    const buildOutput = join(cwd, "steam", "output");
    const scriptPath = join(cwd, "steam", "script.vdf");

    setOutput("script-path", scriptPath);
    setOutput("output-folder", buildOutput);

    await mkdir(buildOutput, {
      recursive: true,
    });

    await mkdir(dirname(scriptPath), {
      recursive: true,
    });

    const script = `"AppBuild"
{
	"AppID" "${appId}" // your AppID
	"Desc" "${description}" // internal description for this build

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

    console.log("script", script);
    const isAuthenticated = await checkSteamAuth({
      context: {
        log,
        abortSignal,
      },
      scriptPath,
      steamcmdPath,
      username,
    });

    log("isAuthenticated", JSON.stringify(isAuthenticated));

    if (isAuthenticated.success === false) {
      log("Opening terminal with interactive login");
      await openExternalTerminal(steamcmdPath, ["+login", username, "+quit"], {
        cancelSignal: abortSignal,
      });
      const isAuthenticatedNow = await checkSteamAuth({
        context: {
          log,
          abortSignal,
        },
        scriptPath,
        steamcmdPath,
        username,
      });
      if (isAuthenticatedNow.success === false) {
        throw new Error("Not authenticated");
      }
    }

    log("Writing script");
    await writeFile(scriptPath, script, {
      encoding: "utf8",
      signal: abortSignal,
    });

    log("Executing steamcmd");

    // Should be authed here
    try {
      await runWithLiveLogsPTY(
        steamcmdPath,
        ["+login", username, "+run_app_build", scriptPath, "+quit"],
        {},
        log,
        {
          onStdout: (data) => {
            log("[steamcmd]", data);
          },
          onStderr: (data) => {
            log("[steamcmd]", data);
          },
        },
        abortSignal,
      );
    } catch (e) {
      if (e instanceof ExternalCommandError) {
        const code = e.code as keyof typeof errorMap;
        const message =
          code in errorMap ? errorMap[code] : "SteamCmd error:" + e.code + " " + e.message;
        throw new Error(message);
      } else if (e instanceof Error) {
        console.error(e);
        throw new Error("Error:" + e.message);
      } else {
        throw new Error("unknwon error");
      }
    }

    setOutput("status", "success");
    log("Done uploading");
  },
);
