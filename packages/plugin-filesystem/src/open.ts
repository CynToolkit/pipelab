import { exec } from "node:child_process";
import { platform } from "node:os";
import { createRequire } from "node:module";
import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";

const require = createRequire(import.meta.url);
// import displayString from './displayStringRun.lua?raw'

export const ID = "fs:open-in-explorer";

export const openInExplorer = createAction({
  id: ID,
  name: "Open path in explorer",
  displayString: "`Open ${fmt.param(params.path, 'primary', 'No path set')} in explorer`",
  params: {
    path: createPathParam("", {
      required: true,
      label: "Path",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory", "openFile"],
        },
      },
    }),
  },

  outputs: {
    message: {
      label: "Message",
      value: "",
    },
  },
  description: "Open a file or folder in your explorer",
  icon: "",
  meta: {},
});

export const openInExplorerRunner = createActionRunner<typeof openInExplorer>(
  async ({ log, inputs, setOutput }) => {
    log(`Opening ${inputs.path}`);

    return new Promise((resolve, reject) => {
      let command = "";
      const p = platform();

      if (p === "win32") {
        command = `start "" "${inputs.path}"`;
      } else if (p === "darwin") {
        command = `open "${inputs.path}"`;
      } else {
        command = `xdg-open "${inputs.path}"`;
      }

      exec(command, (error) => {
        if (error) {
          log(`Error opening path: ${error.message}`);
          setOutput("message", error.message);
          resolve();
        } else {
          setOutput("message", "success");
          resolve();
        }
      });
    });
  },
);
