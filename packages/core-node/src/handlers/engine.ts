import { useAPI } from "../ipc-core";
import { PipelabContext } from "../context";
import { getPluginMetadata } from "../utils";

export const registerEngineHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();

  handle("plugins:metadata:get", async (_, { send }) => {
    const plugins = getPluginMetadata();
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          plugins,
        },
      },
    });
  });
};
