import {
  createAction,
  createActionRunner,
  createStringParam,
  usePluginAPI,
} from "@pipelab/plugin-core";

export const ID = "system:alert";

export type Data = {
  text: string;
};

export const alertAction = createAction({
  id: ID,
  name: "Alert",
  description: "Display a popup alert dialog with a message.",
  icon: "",
  displayString: "`Show alert: ${fmt.param(params.message ?? 'No message')}`",
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

export const alertActionRunner = createActionRunner<typeof alertAction>(
  async ({ log, inputs, setOutput, browserWindow }) => {
    if (!browserWindow) {
      log(`Alert (Headless): ${inputs.message}`);
      setOutput("answer", "ok");
      return;
    }
    
    browserWindow.flashFrame(true);
    const api = usePluginAPI(browserWindow);
    //    'cancel' | 'ok'
    const _answer = await api.execute("dialog:alert", {
      message: inputs.message,
    });

    if (_answer.type === "success") {
      setOutput("answer", _answer.result.answer);
    } else {
      throw new Error(_answer.ipcError);
    }
  },
);
