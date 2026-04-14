import { join, dirname } from "node:path";
import { mkdir, access, chmod } from "node:fs/promises";
import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";

export const ID = "minify:images";

export const minifyImages = createAction({
  id: ID,
  name: "Minify images",
  description: "",
  icon: "",
  displayString: "`Minify`",
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
  },
  outputs: {},
});

export const minifyImagesRunner = createActionRunner<typeof minifyImages>(
  async ({ log, inputs, cwd, abortSignal }) => {
    // TODO: https://github.com/imagemin/imagemin

    log("Minified images");
  },
);
