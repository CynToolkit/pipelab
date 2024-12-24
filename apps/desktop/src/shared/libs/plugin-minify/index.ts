import { createAction, createActionRunner } from "@plugins/plugin-core";

export const FLOW_INPUT_ID = "minify-flow-input";
export const FLOW_OUTPUT_ID = "minify-flow-output";
export const ID = "minify-js-node";

export const minifyImage = createAction({
  id: ID,
  name: "Minify",
  description: "",
  icon: "",
  displayString: "TODO",
  meta: {},
  params: {
    file: {
      value: '',
      label: "Fichier",
      control: {
        type: 'path',
        options: {
          properties: ['openFile']
        }
      }
    },
  },
  outputs: {
  },
});

export const minifyImageRunner = createActionRunner(async ({ log }) => {
  log("minifying");
});
