import { useAPI } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import slash from "slash";

export const registerShellHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("dialog:showOpenDialog", async (event, { value, send }) => {
    logger().info("value", value);
    logger().info("dialog:showOpenDialog");

    // Since we are in a standalone server, we cannot show Electron dialogs.
    // In the future, this could be handled by the UI or a separate GUI process.
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          filePaths: [],
          canceled: true,
        },
      },
    });
  });

  handle("dialog:showSaveDialog", async (event, { value, send }) => {
    const { logger } = useLogger();

    logger().info("value", value);
    logger().info("dialog:showSaveDialog");

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          filePath: undefined,
          canceled: true,
        },
      },
    });
  });

  handle("fs:getHomeDirectory", async (event, { send }) => {
    const { homedir } = await import("node:os");
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          path: homedir(),
        },
      },
    });
  });
};
