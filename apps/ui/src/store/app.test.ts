import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { toRaw } from "vue";

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
    availability.status!.value = "ready";
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
      integrations: [],
    };
    execute.mockResolvedValueOnce({
      type: "success",
      result: { version: "2.0.0", channel: "stable" },
    });
    execute.mockResolvedValueOnce({ type: "success", result: { providers: [provider] } });
    const store = useAppStore();
    await store.init();
    expect(execute).toHaveBeenCalledWith("providers:metadata:get");
    expect(store.providerDefinitions.find((item) => item.id === provider.id)).toMatchObject({
      id: provider.id,
      name: "Steam",
      integrations: [{ name: "Steam Account" }],
    });
    expect(store.providerDefinitions.some((item) => item.id === "@pipelab/plugin-godot")).toBe(
      true,
    );
    expect(store.getProviderDefinition(provider.id)?.name).toBe("Steam");
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
    expect(
      store.providerDefinitions.some((provider) => provider.id === "@pipelab/plugin-steam"),
    ).toBe(true);
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
    expect(store.providerStatus).toBe("ready");

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
    expect(store.providerStatus).toBe("ready");
    availability.status!.value = "ready";
    await store.init();

    expect(store.version).toBe("2.1.0");
    expect(store.channel).toBe("beta");
    expect(
      store.providerDefinitions.some((provider) => provider.id === "@pipelab/plugin-godot"),
    ).toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("serves real release specs and provider identity without an agent", async () => {
    availability.status!.value = "offline";
    const store = useAppStore();

    await store.loadProviderDefinitions();
    const catalog = await store.loadReleaseCatalog();

    expect(catalog.sources.map((source) => source.id)).toContain(
      "@pipelab/plugin-construct/source",
    );
    expect(catalog.producers.some((producer) => producer.targets.length > 0)).toBe(true);
    expect(catalog.destinations.map((destination) => destination.id)).toContain(
      "@pipelab/plugin-steam/destination",
    );
    expect(store.getProviderDefinition("@pipelab/plugin-steam")?.name).toBe("Steam");
    expect(execute).not.toHaveBeenCalled();
  });

  it("overlays runtime availability without losing packaged provider definitions", async () => {
    const store = useAppStore();
    const bundled = structuredClone(toRaw(store.releaseCatalog));
    const runtime = structuredClone(bundled);
    runtime.sources[0].label = "Runtime placeholder";
    runtime.sources[0].fields = undefined;
    runtime.sources[0].defaultConfig = { futureDefault: true };
    runtime.sources.push({
      ...runtime.sources[0],
      id: "@future/plugin/source",
      label: "Future source",
    });
    const target = runtime.producers
      .flatMap((producer) => producer.targets)
      .find((candidate) => "availabilityStatus" in candidate);
    if (!target || !("availabilityStatus" in target)) throw new Error("Expected dynamic target");
    target.availability = {
      available: false,
      reason: "SDK not installed",
    };
    execute.mockResolvedValueOnce({ type: "success", result: runtime });

    const catalog = await store.loadReleaseCatalog();

    expect(catalog.sources[0].label).toBe(bundled.sources[0].label);
    expect(catalog.sources[0].fields).toEqual(bundled.sources[0].fields);
    expect(catalog.sources[0].defaultConfig).toEqual({
      ...runtime.sources[0].defaultConfig,
      ...bundled.sources[0].defaultConfig,
    });
    expect(catalog.sources.some((source) => source.id === "@future/plugin/source")).toBe(true);
    const mergedTarget = catalog.producers
      .flatMap((producer) => producer.targets)
      .find((candidate) => candidate.id === target.id);
    expect(mergedTarget).toMatchObject({
      availability: { available: false, reason: "SDK not installed" },
    });
  });
});
