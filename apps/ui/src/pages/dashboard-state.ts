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
