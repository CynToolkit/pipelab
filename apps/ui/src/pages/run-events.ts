import type { Events } from "@pipelab/shared";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

type RunEventListener = (event: WorkflowEvent) => void;

const eventsByRun = new Map<string, WorkflowEvent[]>();
const listenersByRun = new Map<string, Set<RunEventListener>>();

export const publishRunEvent = (runId: string, event: WorkflowEvent) => {
  const events = eventsByRun.get(runId) || [];
  events.push(event);
  eventsByRun.set(runId, events);
  listenersByRun.get(runId)?.forEach((listener) => listener(event));
};

export const subscribeToRunEvents = (runId: string, listener: RunEventListener) => {
  const listeners = listenersByRun.get(runId) || new Set<RunEventListener>();
  listeners.add(listener);
  listenersByRun.set(runId, listeners);
  eventsByRun.get(runId)?.forEach(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) listenersByRun.delete(runId);
  };
};
