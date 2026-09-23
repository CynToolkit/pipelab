export type InitialDataSection =
  | "projects"
  | "plugins"
  | "settings"
  | "connections"
  | "auth"
  | "subscription";

export type InitialDataFailureKind =
  | "backend-disconnected"
  | "project-config"
  | "connections"
  | "other";

export interface InitialDataFailure {
  kind: InitialDataFailureKind;
  message: string;
}

export type InitialDataResult =
  | { type: "success" }
  | { type: "error"; failure: InitialDataFailure };

export const loadInitialData = async (
  steps: Array<{ section: InitialDataSection; load: () => Promise<unknown> }>,
  isBackendConnected: () => boolean,
): Promise<InitialDataResult> => {
  for (const step of steps) {
    try {
      await step.load();
    } catch (error) {
      const kind: InitialDataFailureKind = !isBackendConnected()
        ? "backend-disconnected"
        : step.section === "projects" || step.section === "settings"
          ? "project-config"
          : step.section === "connections"
            ? "connections"
            : "other";
      return {
        type: "error",
        failure: {
          kind,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
  return { type: "success" };
};
