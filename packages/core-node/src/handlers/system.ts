import { useAPI } from "../ipc-core";
import { PipelabContext, isDev } from "../context";

export const registerSystemHandlers = (options: { version: string; context: PipelabContext }) => {
  const { handle } = useAPI();

  handle("agent:version:get", async (_, { send }) => {
    const isStable =
      options.context.userDataPath.endsWith("app") ||
      !options.context.userDataPath.includes("app-beta");

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          version: isDev ? "workspace" : options.version,
          channel: isDev ? "dev" : isStable ? "stable" : "beta",
        },
      },
    });
  });

  handle("system:packages:cleanup", async (_, { send }) => {
    try {
      const packagesDir = options.context.getPackagesPath();
      const { existsSync } = await import("fs");
      const { rm } = await import("fs/promises");
      if (existsSync(packagesDir)) {
        await rm(packagesDir, { recursive: true, force: true });
      }
      send({
        type: "end",
        data: {
          type: "success",
          result: true,
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message,
        },
      });
    }
  });
};
