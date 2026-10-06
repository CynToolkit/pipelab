import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { execute, on } = vi.hoisted(() => ({ execute: vi.fn(), on: vi.fn() }));
vi.mock("@renderer/composables/api", () => ({ useAPI: () => ({ execute, on }) }));
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
});
