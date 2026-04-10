import { useAPI } from "../ipc-core";

export const registerSystemHandlers = (options: { version: string }) => {
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
