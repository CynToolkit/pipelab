import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("./api", () => ({
  useAPI: () => ({
    isConnected: () => true,
    execute,
  }),
}));

import { useConnectionsConfig } from "./useConfig";

describe("useConnectionsConfig", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({
      type: "success",
      result: { version: "1.0.0", connections: [] },
    });
  });

  it("reloads persisted connections when explicitly forced", async () => {
    const config = useConnectionsConfig();
    await config.load();
    await config.load();
    expect(execute).toHaveBeenCalledTimes(1);

    await config.load(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([channel]) => channel)).toEqual([
      "connections:load",
      "connections:load",
    ]);
  });

  it("rejects when the connection save is refused", async () => {
    execute.mockResolvedValueOnce({
      type: "error",
      ipcError: "Unable to save connections",
    });

    const config = useConnectionsConfig();
    await expect(config.save({ version: "1.0.0", connections: [] })).rejects.toThrow(
      "Unable to save connections",
    );
  });
});
