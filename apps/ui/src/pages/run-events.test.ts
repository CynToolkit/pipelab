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

  it("drops buffered events after a terminal event is replayed", () => {
    const runId = "run-event-terminal-cleanup";
    const log: WorkflowEvent = {
      type: "step.log",
      stepId: "build",
      stream: "stdout",
      message: "built",
      timestamp: 10,
    };
    const failed: WorkflowEvent = {
      type: "workflow.failed",
      error: { name: "Failed", message: "nope" },
      duration: 11,
      timestamp: 12,
    };
    const first: WorkflowEvent[] = [];
    const second: WorkflowEvent[] = [];

    publishRunEvent(runId, log);
    publishRunEvent(runId, failed);
    const unsubscribe = subscribeToRunEvents(runId, (event) => first.push(event));
    const unsubscribeSecond = subscribeToRunEvents(runId, (event) => second.push(event));

    expect(first).toEqual([log, failed]);
    expect(second).toEqual([]);
    unsubscribe();
    unsubscribeSecond();
  });
});
