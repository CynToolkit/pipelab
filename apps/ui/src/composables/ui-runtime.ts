export type UiEnvironment = "desktop" | "browser";

export const getUiEnvironment = (hasElectronBridge: boolean): UiEnvironment =>
  hasElectronBridge ? "desktop" : "browser";

// The build flag controls whether the browser tries to discover an agent on
// startup. It does not restrict a later explicit connection after pairing.
export const shouldAutoConnectAgentOnStartup = (
  environment: UiEnvironment,
  configuredMode: string | undefined,
) => environment === "desktop" || configuredMode !== "hosted";

export const uiEnvironment = getUiEnvironment(
  typeof window !== "undefined" && Boolean(window.electron),
);

export const shouldAutoConnectAgent = shouldAutoConnectAgentOnStartup(
  uiEnvironment,
  import.meta.env.VITE_PIPELAB_MODE,
);
