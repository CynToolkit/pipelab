/**
 * Auth is settled once session restoration finished: signed-out, error and validation states
 * need no subscription, while a signed-in user also needs a settled (ready/error) subscription.
 */
export const isDashboardAuthSettled = (
  authState: string,
  subscriptionStatus: "idle" | "loading" | "ready" | "error",
): boolean => {
  if (authState === "INITIALIZING" || authState === "LOADING") return false;
  if (authState === "SIGNED_IN")
    return subscriptionStatus === "ready" || subscriptionStatus === "error";
  return true;
};

export type DashboardDisplayState = "empty" | "search-empty" | "list";

export const resolveSelectedProjectId = (
  projects: readonly { id: string }[],
  selectedId?: string,
): string | undefined => {
  if (selectedId && projects.some((project) => project.id === selectedId)) return selectedId;
  return projects[0]?.id;
};

export const getDashboardDisplayState = (counts: {
  workflows: number;
  brokenWorkflows: number;
  filteredWorkflows: number;
}): DashboardDisplayState => {
  if (counts.workflows === 0 && counts.brokenWorkflows === 0) return "empty";
  if (counts.filteredWorkflows === 0 && counts.brokenWorkflows === 0) return "search-empty";
  return "list";
};
