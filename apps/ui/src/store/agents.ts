import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { websocketManager } from "@renderer/composables/websocket-manager";
import { useLogger } from "@pipelab/shared/logger";
import { useAppSettings } from "./settings";
import { websocketPort } from "@pipelab/constants";

export interface AgentConfig {
  id: string;
  name: string;
  url: string;
}

export const useAgentsStore = defineStore(
  "agents",
  () => {
    const { logger } = useLogger();
    const settingsStore = useAppSettings();

    const selectedAgentId = ref<string | null>(null);
    const isTestingLocalhost = ref(false);
    const localhostDetected = ref(false);

    const agents = computed<AgentConfig[]>(() => {
      return settingsStore.settings?.agents || [];
    });

    const selectedAgent = computed(() => {
      return agents.value.find((a) => a.id === selectedAgentId.value) || null;
    });

    const connectToSelectedAgent = async () => {
      if (selectedAgent.value) {
        await websocketManager.connect(selectedAgent.value.url);
      } else if (agents.value.length > 0) {
        // Auto-select first agent if none selected
        selectedAgentId.value = agents.value[0].id;
        await websocketManager.connect(agents.value[0].url);
      } else {
        // No agents, use default connect behavior (which uses the fallback url)
        await websocketManager.connect();
      }
    };

    // When selected agent changes, reconnect
    watch(selectedAgentId, async (newId, oldId) => {
      if (newId !== oldId) {
        logger().info(`Selected agent changed to ${newId}, reconnecting...`);
        await connectToSelectedAgent();
      }
    });

    const testLocalhostAgent = async () => {
      isTestingLocalhost.value = true;
      try {
        const defaultUrl = `ws://localhost:${websocketPort}`;
        const isAlreadyAdded = agents.value.some((a) => a.url === defaultUrl);

        if (isAlreadyAdded) {
          localhostDetected.value = false;
          return;
        }

        // Temporary connection to test
        const testWs = new WebSocket(defaultUrl);

        const isConnected = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            testWs.close();
            resolve(false);
          }, 2000);

          testWs.onopen = () => {
            clearTimeout(timeout);
            testWs.close();
            resolve(true);
          };

          testWs.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        });

        localhostDetected.value = isConnected;
      } catch (error) {
        logger().error("Failed to test localhost agent:", error);
        localhostDetected.value = false;
      } finally {
        isTestingLocalhost.value = false;
      }
    };

    const init = async () => {
      // Try to restore previous selection, or select first available
      if (agents.value.length > 0) {
        if (!selectedAgentId.value || !agents.value.find((a) => a.id === selectedAgentId.value)) {
          selectedAgentId.value = agents.value[0].id;
        }
      }

      // Test for localhost in background
      setTimeout(() => {
        testLocalhostAgent();
      }, 2000);

      // Ensure connection based on selection
      await connectToSelectedAgent();
    };

    const addLocalhostAgent = async () => {
      const { nanoid } = await import("nanoid");
      const updatedAgents = [...agents.value];
      const newAgent = {
        id: nanoid(),
        name: "Local Desktop",
        url: `ws://localhost:${websocketPort}`,
      };

      updatedAgents.push(newAgent);

      if (settingsStore.settings) {
        await settingsStore.updateSettings({
          ...settingsStore.settings,
          agents: updatedAgents,
        });
        selectedAgentId.value = newAgent.id;
        localhostDetected.value = false;
      }
    };

    return {
      agents,
      selectedAgentId,
      selectedAgent,
      isTestingLocalhost,
      localhostDetected,
      init,
      addLocalhostAgent,
    };
  },
  {
    persist: {
      paths: ["selectedAgentId"],
    },
  },
);
