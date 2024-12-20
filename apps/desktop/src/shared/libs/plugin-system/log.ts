import { createAction, createActionRunner } from "@pipelab/plugin-core";

export const ID = "log";

export type Data = {
  text: string;
};

export const logAction = createAction({
  id: ID,
  name: "Log",
  description: "Log a message",
  icon: "",
  displayString: "`Log \"${fmt.param(params.message)}\"`",
  meta: {},
  params: {
    message: {
      value: '',
      label: "Message",
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
  },

  outputs: {
  },
});

export const logActionRunner = createActionRunner<typeof logAction>(async ({ log, inputs }) => {
  log(`${inputs.message ?? ""}`);
})
