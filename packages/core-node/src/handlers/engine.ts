import { useAPI } from "../ipc-core";
import { PipelabContext } from "../context";
import { getProviderMetadata } from "../utils";

export const registerEngineHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();

  handle("providers:metadata:get", async (_, { send }) => {
    const providers = getProviderMetadata();
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          providers,
        },
      },
    });
  });
};
