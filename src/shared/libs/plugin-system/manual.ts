import { createEvent, createEventRunner } from "@cyn/plugin-core";

export const ID = "manual";

export type Data = {};

export const manualEvent = createEvent({
  id: ID,
  name: "Manual",
  description: "Start a pipeline manually",
  displayString: "'Start the pipeline manually'",
  icon: "",
  meta: {},
  params: {},
  outputs: {},
});

export const manualEvaluator = createEventRunner<typeof manualEvent>(async () => {
  return;
});
