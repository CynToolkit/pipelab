export type UiRuntimeMode = "desktop" | "agent" | "hosted";

export const getUiRuntimeMode = (
  hasElectronBridge: boolean,
  configuredMode: string | undefined,
): UiRuntimeMode => {
  if (hasElectronBridge) return "desktop";
  return configuredMode === "hosted" ? "hosted" : "agent";
};

export const shouldStartAgentConnection = (mode: UiRuntimeMode) => mode !== "hosted";

export const uiRuntimeMode = getUiRuntimeMode(
  typeof window !== "undefined" && Boolean(window.electron),
  import.meta.env.VITE_PIPELAB_MODE,
);
