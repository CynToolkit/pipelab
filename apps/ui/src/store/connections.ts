import { defineStore } from "pinia";
import { ConnectionsConfig } from "@pipelab/shared";
import { watch } from "vue";
import { useAuth } from "./auth";
import { useConnectionsConfig } from "@renderer/composables/useConfig";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";

export const useConnectionsStore = defineStore("connections", () => {
  const auth = useAuth();
  const agent = useAgentAvailability();
  const {
    data: connectionsState,
    load,
    save,
    status,
    error,
    loaded,
    requested,
  } = useConnectionsConfig();

  const init = async () => {
    await load();
  };

  const updateConnections = async (_connections: ConnectionsConfig) => {
    await save(_connections);
  };

  watch([() => auth.user, agent.isReady], ([user, ready], previous) => {
    if (requested.value && ready && (user !== previous?.[0] || !previous?.[1])) {
      void load(user !== previous?.[0]).catch(() => undefined);
    }
  });

  return {
    init,
    updateConnections,
    connections: connectionsState,
    load,
    status,
    error,
    loaded,
    requested,
  };
});
