import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { execute, on } = vi.hoisted(() => ({ execute: vi.fn(), on: vi.fn() }));
const availability = vi.hoisted(() => ({ status: undefined as { value: string } | undefined }));
vi.mock("@renderer/composables/api", () => ({ useAPI: () => ({ execute, on }) }));
vi.mock("@renderer/composables/useAgentAvailability", async () => {
  const { computed, ref } = await import("vue");
  const status = ref("ready");
  availability.status = status;
  return {
    useAgentAvailability: () => ({ status, isReady: computed(() => status.value === "ready") }),
  };
});
import { useAppStore } from "./app";

describe("built-in provider metadata", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    execute.mockReset();
    on.mockReset();
  });
  it("loads a complete static list without subscribing to dynamic loading", async () => {
    const provider = {
      id: "@pipelab/plugin-steam",
      packageName: "@pipelab/plugin-steam",
      name: "Steam",
      description: "Publishing",
      isOfficial: true,
      icon: { type: "icon", icon: "pi-box" },
    };
    execute.mockResolvedValueOnce({
      type: "success",
      result: { version: "2.0.0", channel: "stable" },
    });
    execute.mockResolvedValueOnce({ type: "success", result: { providers: [provider] } });
    const store = useAppStore();
    await store.init();
    expect(execute).toHaveBeenCalledWith("providers:metadata:get");
    expect(store.providerDefinitions).toEqual([provider]);
    expect(store.getProviderDefinition(provider.id)).toEqual(provider);
    expect(on).not.toHaveBeenCalled();
  });
  it("reports metadata failures without leaving a partial registry", async () => {
    execute.mockResolvedValueOnce({
      type: "success",
      result: { version: "2.0.0", channel: "stable" },
    });
    execute.mockResolvedValueOnce({ type: "error", ipcError: "metadata unavailable" });
    const store = useAppStore();
    await expect(store.init()).rejects.toThrow("metadata unavailable");
    expect(store.providerDefinitions).toEqual([]);
  });

  it("loads runtime info independently and deduplicates concurrent requests", async () => {
    let resolveVersion!: (value: unknown) => void;
    execute.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVersion = resolve;
      }),
    );
    const store = useAppStore();
    const first = store.loadRuntimeInfo();
    const second = store.loadRuntimeInfo();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("agent:version:get");
    expect(store.providerStatus).toBe("idle");

    resolveVersion({ type: "success", result: { version: "2.1.0", channel: "stable" } });
    await Promise.all([first, second]);
    expect(store.version).toBe("2.1.0");
    expect(store.runtimeStatus).toBe("ready");
  });

  it("invalidates ready runtime and provider state across reconnects", async () => {
    const provider = {
      id: "@pipelab/plugin-steam",
      packageName: "@pipelab/plugin-steam",
      name: "Steam",
      description: "Publishing",
      isOfficial: true,
      icon: { type: "icon", icon: "pi-box" },
    };
    execute
      .mockResolvedValueOnce({ type: "success", result: { version: "2.0.0", channel: "stable" } })
      .mockResolvedValueOnce({ type: "success", result: { providers: [provider] } })
      .mockResolvedValueOnce({ type: "success", result: { version: "2.1.0", channel: "beta" } })
      .mockResolvedValueOnce({ type: "success", result: { providers: [] } });
    const store = useAppStore();
    await store.init();
    expect(store.version).toBe("2.0.0");

    availability.status!.value = "offline";
    expect(store.runtimeStatus).toBe("idle");
    expect(store.providerStatus).toBe("idle");
    availability.status!.value = "ready";
    await store.init();

    expect(store.version).toBe("2.1.0");
    expect(store.channel).toBe("beta");
    expect(store.providerDefinitions).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
