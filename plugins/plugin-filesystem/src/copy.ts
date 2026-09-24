import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";
import { copyPath } from "@pipelab/workflow-runtime";

export const ID = "fs:copy";

export const copy = createAction({
  id: ID,
  name: "Copy file/folder",
  displayString:
    '`Copy ${fmt.param(params.from, "primary", "Source")} to ${fmt.param(params.to, "primary", "Destination")}`',
  params: {
    from: createPathParam("", {
      label: "From",
      required: true,
      control: {
        type: "path",
        options: {
          properties: ["openFile", "openDirectory"],
        },
      },
    }),
    to: createPathParam("", {
      label: "To",
      required: true,
      control: {
        type: "path",
        warnIfBlacklisted: true,
        options: {
          properties: ["openFile", "openDirectory", "createDirectory", "promptToCreate"],
        },
      },
    }),
    recursive: {
      label: "Recursive",
      required: true,
      value: true,
      control: {
        type: "boolean",
      },
    },
    overwrite: {
      label: "Overwrite",
      required: true,
      value: true,
      control: {
        type: "boolean",
      },
    },
    cleanup: {
      label: "Cleanup",
      required: true,
      description: "Delete existing files at destination before copying",
      value: true,
      control: {
        type: "boolean",
      },
    },
  },

  outputs: {
    output: {
      label: "Output",
      value: "",
      description: "The copied file/folder",
    },
    input: {
      label: "Input",
      value: "",
      description: "The original file/folder",
    },
    parentDirectory: {
      label: "Parent directory",
      value: "",
      description: "The parent directory of the copied file/folder",
    },
  },
  description: "Copy a file or a folder from one location to another",
  icon: "",
  meta: {},
});

export const copyRunner = createActionRunner<typeof copy>(async ({ log, inputs, setOutput }) => {
  log("");
  const { output, input, parentDirectory } = await copyPath({
    from: inputs.from,
    to: inputs.to,
    recursive: inputs.recursive,
    overwrite: inputs.overwrite,
    cleanup: inputs.cleanup,
    log,
  });
  setOutput("output", output);
  setOutput("input", input);
  setOutput("parentDirectory", parentDirectory);
});
