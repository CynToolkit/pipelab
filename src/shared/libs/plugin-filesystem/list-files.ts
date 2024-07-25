import { createAction, createActionRunner } from "@cyn/plugin-core";
export const ID = "list-files-node";

export const ListFilesAction = createAction({
  id: ID,
  name: "List files",
  displayString: "`List files \"${params.recursive ? 'recursively' : ''}\" from \"${params.folder}`",
  params: {
    folder: {
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      },
      value: '',
      label: "Folder",
    },
    recursive: {
      control: {
        type: 'boolean',
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


export const ListFilesActionRun = createActionRunner<typeof ListFilesAction>(async ({ log, inputs, setOutput }) => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const readdir = fs.readdir;

  log("");

  log("inputs", inputs);

  const folder = inputs.folder;
  const recursive = inputs.recursive;

  log("folder", folder);

  const response = await readdir(folder, {
    withFileTypes: true,
    recursive,
  });

  log("response", response);

  const files = response;

  log("-- setValue('paths')");
  setOutput(
    "paths",
    files.map((x) => path.join(x.path, x.name))
  );
})
