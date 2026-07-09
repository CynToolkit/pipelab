import fs from "node:fs/promises";
import path from "node:path";
import { createAction, createActionRunner } from "@pipelab/plugin-core";
export const ID = "list-files-node";

export const ListFilesAction = createAction({
  id: ID,
  name: "List files",
  displayString:
    "`List files \"${params.recursive ? 'recursively' : ''}\" from \"${params.folder}`",
  params: {
    folder: {
      required: true,
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
      value: "",
      label: "Folder",
    },
    recursive: {
      required: true,
      control: {
        type: "boolean",
      },
      value: false,
      label: "Recursive",
    },
  },

  outputs: {
    paths: {
      value: [] as Array<string>,
      label: "Paths",
    },
  },
  description: "List files from a folder",
  icon: "",
  meta: {},
});

export const ListFilesActionRun = createActionRunner<typeof ListFilesAction>(
  async ({ log, inputs, setOutput, abortSignal }) => {
    const readdir = fs.readdir;

    log("");

    log("inputs", inputs);

    const folder = inputs.folder;
    if (typeof folder !== "string") {
      throw new Error("Folder path must be a string");
    }

    const recursive = typeof inputs.recursive === "boolean" ? inputs.recursive : false;

    log("folder", folder);

    abortSignal?.throwIfAborted();

    const response = await readdir(folder, {
      withFileTypes: true,
      recursive,
    });

    abortSignal?.throwIfAborted();

    log("response", response);

    const files = response;

    log("-- setValue('paths')");
    setOutput(
      "paths",
      files.map((x) => path.join(x.parentPath ?? (x as any).path, x.name)),
    );
  },
);
