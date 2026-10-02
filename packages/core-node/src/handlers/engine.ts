import { useAPI } from "../ipc-core";
import { PipelabContext } from "../context";
import { getFinalPlugins } from "../utils";

export const registerEngineHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();

  handle("nodes:get", async (_, { send }) => {
    const finalPlugins = getFinalPlugins();
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          nodes: finalPlugins,
        },
      },
    });
  });
};
