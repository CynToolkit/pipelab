import type { Events } from "@pipelab/shared";
import { describe, expect, it } from "vitest";
import { publishRunEvent, subscribeToRunEvents } from "./run-events";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

describe("run event stream", () => {
  it("replays workflow events published before the run detail subscribes", () => {
    const event: WorkflowEvent = {
      type: "step.log",
      stepId: "build",
      stream: "stdout",
      message: "built",
      timestamp: 10,
    };
    const received: WorkflowEvent[] = [];

    publishRunEvent("run-event-replay", event);
    const unsubscribe = subscribeToRunEvents("run-event-replay", (next) => received.push(next));

    expect(received).toEqual([event]);
    unsubscribe();
  });
});
