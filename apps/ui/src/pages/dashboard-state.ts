export type DashboardDisplayState = "empty" | "search-empty" | "list";

export const getDashboardDisplayState = (counts: {
  files: number;
  workflows: number;
  brokenWorkflows: number;
  filteredFiles: number;
  filteredWorkflows: number;
}): DashboardDisplayState => {
  if (counts.files === 0 && counts.workflows === 0 && counts.brokenWorkflows === 0) return "empty";
  if (counts.filteredFiles === 0 && counts.filteredWorkflows === 0 && counts.brokenWorkflows === 0)
    return "search-empty";
  return "list";
};
