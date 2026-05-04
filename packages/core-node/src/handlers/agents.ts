import { useAPI } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import { webSocketServer } from "../websocket-server";
import { PipelabContext } from "../context";

export const registerAgentsHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("agents:get", async (event, { send }) => {
    try {
      const agents = webSocketServer.getAgents();

      send({
        type: "end",
        data: {
          type: "success",
          result: { agents },
        },
      });
    } catch (error) {
      logger().error("Failed to get agents:", error);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Failed to get agents",
        },
      });
    }
  });
};
