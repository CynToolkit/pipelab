import type { Events } from "@pipelab/shared";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

type RunEventListener = (event: WorkflowEvent) => void;

const eventsByRun = new Map<string, WorkflowEvent[]>();
const listenersByRun = new Map<string, Set<RunEventListener>>();
const terminalCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const isTerminalEvent = (event: WorkflowEvent) =>
  event.type === "workflow.completed" || event.type === "workflow.failed";

const scheduleTerminalCleanup = (runId: string) => {
  if (terminalCleanupTimers.has(runId)) return;
  terminalCleanupTimers.set(
    runId,
    setTimeout(
      () => {
        terminalCleanupTimers.delete(runId);
        eventsByRun.delete(runId);
      },
      5 * 60 * 1000,
    ),
  );
};

export const publishRunEvent = (runId: string, event: WorkflowEvent) => {
  const events = eventsByRun.get(runId) || [];
  events.push(event);
  eventsByRun.set(runId, events);
  const listeners = listenersByRun.get(runId);
  listeners?.forEach((listener) => listener(event));
  if (isTerminalEvent(event)) {
    if (listeners?.size) {
      eventsByRun.delete(runId);
    } else {
      scheduleTerminalCleanup(runId);
    }
  }
};

export const subscribeToRunEvents = (runId: string, listener: RunEventListener) => {
  const listeners = listenersByRun.get(runId) || new Set<RunEventListener>();
  listeners.add(listener);
  listenersByRun.set(runId, listeners);
  const buffered = eventsByRun.get(runId) || [];
  buffered.forEach(listener);
  if (buffered.some(isTerminalEvent)) {
    eventsByRun.delete(runId);
    const timer = terminalCleanupTimers.get(runId);
    if (timer) clearTimeout(timer);
    terminalCleanupTimers.delete(runId);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) listenersByRun.delete(runId);
  };
};
