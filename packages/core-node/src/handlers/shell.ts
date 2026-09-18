import { useAPI } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import { PipelabContext } from "../context";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const registerShellHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("shell:openPath", async (_, { value, send }) => {
    const path = typeof value?.path === "string" ? value.path : "";
    const artifactRoot = resolve(context.getArtifactsPath());
    const artifactPath = resolve(path);
    const pathFromRoot = relative(artifactRoot, artifactPath);
    if (
      !path ||
      !isAbsolute(path) ||
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      await send({
        type: "end",
        data: { type: "error", ipcError: "Only local artifact paths can be opened" },
      });
      return;
    }
    const command =
      process.platform === "win32"
        ? "explorer.exe"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    execFile(command, [artifactPath], (error) => {
      void send(
        error
          ? { type: "end", data: { type: "error", ipcError: error.message } }
          : { type: "end", data: { type: "success", result: undefined } },
      );
    });
  });

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
