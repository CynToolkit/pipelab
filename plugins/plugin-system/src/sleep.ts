import { createAction, createActionRunner, createNumberParam } from "@pipelab/plugin-core";

export const ID = "system:sleep";

export const sleepAction = createAction({
  id: ID,
  name: "Wait",
  description: "Pause the pipeline execution for a specified duration.",
  icon: "",
  displayString: "`Wait for ${fmt.param(params.duration)}ms`",
  meta: {},
  params: {
    duration: createNumberParam(2000, {
      required: true,
      label: "Duration",
    }),
  },

  outputs: {},
});

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export const sleepActionRunner = createActionRunner<typeof sleepAction>(
  async ({ inputs, abortSignal }) => {
    if (abortSignal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout);
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        reject(abortError);
      };

      abortSignal.addEventListener("abort", onAbort);

      const timeout = setTimeout(() => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve();
      }, inputs.duration);
    });
  },
);
