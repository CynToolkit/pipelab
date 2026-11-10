import type { ReleaseWorkflowSettings } from "@pipelab/shared";

export type RunOutcome = "success" | "failure" | "cancelled";

/** `completed-with-errors` counts as a failure: something the user asked for did not ship. */
export const runOutcome = (status: string): RunOutcome =>
  status === "completed" ? "success" : status === "cancelled" ? "cancelled" : "failure";

export const shouldNotify = (
  settings: ReleaseWorkflowSettings["notifications"],
  outcome: RunOutcome,
): boolean =>
  outcome === "success"
    ? settings?.onSuccess !== false
    : outcome === "failure"
      ? settings?.onFailure !== false
      : false;

const supported = () => typeof Notification !== "undefined";

/** Asks once, when the user turns a notification on, so a later run never prompts mid-flight. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!supported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
};

export const notifyRunFinished = (
  workflowName: string,
  outcome: RunOutcome,
  settings: ReleaseWorkflowSettings["notifications"],
) => {
  if (!supported() || Notification.permission !== "granted" || !shouldNotify(settings, outcome))
    return;
  new Notification(workflowName, {
    body: outcome === "success" ? "Release finished." : "Release finished with errors.",
  });
};
