import { useAPI } from "../ipc-core";
import { PipelabContext } from "../context";

export const registerSystemHandlers = (options: { version: string; context: PipelabContext }) => {
  const { handle } = useAPI();

  handle("agent:version:get", async (_, { send }) => {
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          version: options.version,
        },
      },
    });
  });
};
