import { createAction, createActionRunner, createStringParam } from "@pipelab/plugin-core";

export const ID = "log";

export type Data = {
  text: string;
};

export const logAction = createAction({
  id: ID,
  name: "Log",
  description: "Write a custom message to the execution log.",
  icon: "",
  displayString: '`Log message: "${fmt.param(params.message)}"`',
  meta: {},
  params: {
    message: createStringParam("", {
      required: true,
      label: "Message",
    }),
  },

  outputs: {},
});

export const logActionRunner = createActionRunner<typeof logAction>(async ({ log, inputs }) => {
  log(`${inputs.message ?? ""}`);
});
