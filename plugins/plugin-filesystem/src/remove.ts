import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";
import { removePath } from "@pipelab/workflow-runtime";

export const ID = "fs:remove";

export const remove = createAction({
  id: ID,
  name: "Remove file/folder",
  displayString: '`Remove ${fmt.param(params.from, "primary")}`',
  params: {
    from: createPathParam("", {
      label: "Path",
      required: true,
      control: {
        type: "path",
        warnIfBlacklisted: true,
        options: {
          properties: ["openFile"],
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
  },

  outputs: {},
  description: "Remove a file or a folder",
  icon: "",
  meta: {},
});

export const removeRunner = createActionRunner<typeof remove>(async ({ log, inputs }) => {
  log("");
  if (!inputs.from) throw new Error("Missing source");
  try {
    await removePath(inputs.from, { recursive: inputs.recursive, log });
  } catch (error) {
    log("Error removeing file", error);
    throw error;
  }
});
