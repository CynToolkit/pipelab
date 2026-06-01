import { defineStore } from "pinia";
import { ConnectionsConfig } from "@pipelab/shared";
import { readonly, watch } from "vue";
import { useAuth } from "./auth";
import { useConnectionsConfig } from "@renderer/composables/useConfig";

export const useConnectionsStore = defineStore("connections", () => {
  const auth = useAuth();
  const { data: connectionsState, load, save } = useConnectionsConfig();

  const init = async () => {
    await load();
  };

  const updateConnections = async (_connections: ConnectionsConfig) => {
    await save(_connections);
  };

  watch(
    () => auth.user,
    () => {
      load();
    },
  );

  return {
    init,
    updateConnections,
    connections: readonly(connectionsState),
    load,
  };
});
