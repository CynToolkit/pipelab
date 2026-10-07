import { computed, readonly, ref } from "vue";
import { useWebSocketAPI } from "./websocket-client";
import { websocketManager } from "./websocket-manager";

export type AgentStatus = "offline" | "connecting" | "starting" | "ready";

const status = ref<AgentStatus>("offline");
let startPromise: Promise<void> | undefined;
let startupListenerRegistered = false;

const syncConnectionState = (state: typeof websocketManager.connectionState.value) => {
  if (state === "connected") {
    if (status.value !== "ready") status.value = "starting";
  } else if (state === "connecting") {
    status.value = "connecting";
  } else {
    status.value = "offline";
  }
};

websocketManager.onStateChange(syncConnectionState);

const isReady = computed(() => status.value === "ready");

const ensureStartupListener = () => {
  if (startupListenerRegistered) return;
  startupListenerRegistered = true;
  const api = useWebSocketAPI();
  api.on("startup:progress", (event) => {
    if (event.type === "done" && websocketManager.connectionState.value === "connected") {
      status.value = "ready";
    }
  });
};

const connect = async () => {
  ensureStartupListener();
  status.value = "connecting";
  try {
    await websocketManager.connect();
    syncConnectionState(websocketManager.connectionState.value);
  } catch (error) {
    status.value = "offline";
    throw error;
  }
};

const start = () => {
  if (startPromise) return startPromise;
  startPromise = connect().finally(() => {
    startPromise = undefined;
  });
  return startPromise;
};

export const useAgentAvailability = () => ({
  status: readonly(status),
  isReady,
  start,
  reconnect: connect,
});
