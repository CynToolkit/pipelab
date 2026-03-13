import { useAPI } from "../ipc-core";
import { getSystemContext } from "../context";
import { useLogger } from "@pipelab/shared/logger";
import slash from "slash";

export const registerShellHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("dialog:showOpenDialog", async (event, { value, send }) => {
    logger().info("value", value);
    logger().info("dialog:showOpenDialog");

    const { showOpenDialog } = getSystemContext();

    const { canceled, filePaths } = await showOpenDialog(value);

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          filePaths: filePaths.map((f: string) => slash(f)),
          canceled,
        },
      },
    });
  });

  handle("dialog:showSaveDialog", async (event, { value, send }) => {
    const { logger } = useLogger();

    logger().info("value", value);
    logger().info("dialog:showSaveDialog");

    const { showSaveDialog } = getSystemContext();

    const { canceled, filePath } = await showSaveDialog(value);

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          filePath,
          canceled,
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
