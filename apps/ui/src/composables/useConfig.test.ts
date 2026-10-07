import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const execute = vi.fn();
let connected = true;
const mocks = vi.hoisted(() => ({ agentStatus: undefined as ReturnType<typeof ref> | undefined }));

vi.mock("./useAgentAvailability", async () => {
  const { computed, ref } = await import("vue");
  const agentStatus = ref("ready");
  mocks.agentStatus = agentStatus;
  return {
    useAgentAvailability: () => ({
      status: agentStatus,
      isReady: computed(() => agentStatus.value === "ready"),
    }),
  };
});

vi.mock("./api", () => ({
  useAPI: () => ({
    isConnected: () => connected,
    execute,
  }),
}));

import { useConnectionsConfig } from "./useConfig";

describe("useConnectionsConfig", () => {
  beforeEach(() => {
    connected = true;
    mocks.agentStatus!.value = "ready";
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
    const config = useConnectionsConfig();
    await config.load();
    execute.mockResolvedValueOnce({
      type: "error",
      ipcError: "Unable to save connections",
    });

    await expect(config.save({ version: "1.0.0", connections: [] })).rejects.toThrow(
      "Unable to save connections",
    );
  });

  it("propagates connection load failures instead of presenting defaults as loaded", async () => {
    execute.mockResolvedValueOnce({ type: "error", ipcError: "Corrupt connections file" });
    const config = useConnectionsConfig();
    await expect(config.load()).rejects.toThrow("Corrupt connections file");
    expect(config.error.value).toBe("Corrupt connections file");
  });

  it("allows a failed load to be retried without requiring force", async () => {
    execute
      .mockResolvedValueOnce({ type: "error", ipcError: "Temporary read failure" })
      .mockResolvedValueOnce({
        type: "success",
        result: { version: "1.0.0", connections: [] },
      });
    const config = useConnectionsConfig();

    await expect(config.load()).rejects.toThrow("Temporary read failure");
    await expect(config.load()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects disconnected loads instead of presenting defaults as persisted", async () => {
    connected = false;
    const config = useConnectionsConfig();

    await expect(config.load()).rejects.toThrow("API is not connected");
    expect(config.error.value).toBe("API is not connected");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects disconnected saves without changing local state", async () => {
    connected = false;
    const config = useConnectionsConfig();
    const original = config.data.value;
    const next = { version: "1.0.0" as const, connections: [] };

    await expect(config.save(next)).rejects.toThrow("API is not connected");
    expect(config.data.value).toBe(original);
  });

  it("does not save defaults before persisted data is confirmed", async () => {
    const config = useConnectionsConfig();
    await expect(config.save({ version: "1.0.0", connections: [] })).rejects.toThrow(
      "before loading persisted data",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("invalidates an in-flight load when the agent disconnects", async () => {
    let resolveLoad!: (value: {
      type: "success";
      result: { version: string; connections: [] };
    }) => void;
    execute.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const config = useConnectionsConfig();
    const pending = config.load();
    mocks.agentStatus!.value = "offline";
    connected = false;
    resolveLoad({ type: "success", result: { version: "1.0.0", connections: [] } });
    await pending;
    expect(config.status.value).toBe("idle");
    expect(config.loaded.value).toBe(false);
  });

  it("does not apply a save response after the agent disconnects", async () => {
    const config = useConnectionsConfig();
    await config.load();
    const original = config.data.value;
    let resolveSave!: (value: { type: "success"; result: undefined }) => void;
    execute.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const next = { version: "1.0.0" as const, connections: [] };
    const pending = config.save(next);
    mocks.agentStatus!.value = "offline";
    connected = false;
    resolveSave({ type: "success", result: undefined });

    await expect(pending).rejects.toThrow("Agent disconnected before the save completed");
    expect(config.data.value).toBe(original);
  });
});
