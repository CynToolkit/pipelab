import { ExtractInputsFromAction, createAction, createActionRunner } from "@cyn/plugin-core";
import { exportc3p, sharedParams } from "./export-shared.js";

export const ID = "export-construct-project";

export const exportAction = createAction({
  id: ID,
  name: "Export .c3p",
  displayString: "`Export projet ${params.version ? `r${params.version}` : ''}`",
  meta: {},
  params: {
    file: {
      label: "File (.c3p)",
      value: "",
      control: {
        type: "path",
      },
    },
    ...sharedParams,
  },
  outputs: {
    folder: {
      type: "data",
      value: undefined as undefined | string,
      label: "Folder",
      // schema: schema.string()
    },
  },
  description: "Export construct project from .c3p file",
  icon: "",
});

export const ExportActionRunner = createActionRunner<typeof exportAction>(
  async (options) => {
    const file = options.inputs.file

    await exportc3p(file, options);
    options.log("exportc3p done");
  }
);

export type Params = ExtractInputsFromAction<typeof exportAction>