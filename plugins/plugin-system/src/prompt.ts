import {
  createAction,
  createActionRunner,
  createStringParam,
  usePluginAPI,
} from "@pipelab/plugin-core";

export const ID = "system:prompt";

export type Data = {
  text: string;
};

export const promptAction = createAction({
  id: ID,
  name: "Prompt",
  description: "Display a dialog box asking the user to input text.",
  icon: "",
  displayString: "`Ask for input: ${fmt.param(params.message ?? 'No message')}`",
  meta: {},
  params: {
    message: createStringParam("", {
      required: true,
      label: "Message",
    }),
  },

  outputs: {
    answer: {
      label: "Answer",
      value: "",
    },
  },
});

export const promptActionRunner = createActionRunner<typeof promptAction>(
  async ({ log, inputs, setOutput, browserWindow }) => {
    browserWindow.flashFrame(true);
    const api = usePluginAPI(browserWindow);
    //    'cancel' | 'ok'
    const _answer = await api.execute("dialog:prompt", {
      message: inputs.message,
    });

    log("_answer", _answer);

    if (_answer.type === "success") {
      setOutput("answer", _answer.result.answer);
    } else {
      throw new Error(_answer.ipcError);
    }
  },
);
