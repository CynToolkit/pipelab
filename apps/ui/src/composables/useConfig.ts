import { computed, ref, readonly, watch } from "vue";
import { useAPI } from "./api";
import { useAgentAvailability } from "./useAgentAvailability";
import {
  AppConfig,
  ConnectionsConfig,
  FileRepo,
  defaultAppSettings,
  defaultConnections,
  defaultFileRepo,
} from "@pipelab/shared";

function createConfigComposable<T>(
  loadChannel: "settings:load" | "connections:load" | "projects:load",
  saveChannel: "settings:save" | "connections:save" | "projects:save",
  resetChannel: "settings:reset" | "connections:reset" | "projects:reset",
  defaultValue: T,
) {
  const api = useAPI();
  const agent = useAgentAvailability();
  const data = ref<T>(defaultValue);
  const status = ref<"idle" | "loading" | "ready" | "error">("idle");
  const error = ref<string>();
  const loaded = computed(() => status.value === "ready");
  const requested = ref(false);
  let loadedPromise: Promise<void> | undefined;
  let requestGeneration = 0;

  watch(
    agent.status,
    (next, previous) => {
      if (next !== "ready") {
        requestGeneration++;
        loadedPromise = undefined;
        if (status.value === "loading") status.value = "idle";
      } else if (previous !== "ready" && status.value === "ready") {
        // Keep the cached value visible, but require a fresh confirmation before saving.
        status.value = "idle";
      }
    },
    { flush: "sync" },
  );

  const load = async (force = false): Promise<void> => {
    requested.value = true;
    if (status.value === "ready" && !force) return;
    if (loadedPromise) {
      return loadedPromise;
    }

    const generation = ++requestGeneration;
    loadedPromise = (async () => {
      if (!agent.isReady.value || !api.isConnected()) {
        const unavailable = new Error("API is not connected");
        error.value = unavailable.message;
        status.value = "error";
        loadedPromise = undefined;
        throw unavailable;
      }

      status.value = "loading";
      error.value = undefined;
      try {
        const result = await api.execute(loadChannel as any);
        if (generation !== requestGeneration || !agent.isReady.value) return;
        if (result.type === "success") {
          const loadedValue: T = result.result;
          data.value = loadedValue;
          status.value = "ready";
        } else {
          console.error(`[useConfig] failed to load "${loadChannel}":`, result.ipcError);
          error.value = result.ipcError;
          status.value = "error";
          throw new Error(result.ipcError);
        }
      } catch (err) {
        if (generation !== requestGeneration) return;
        console.error(`[useConfig] error loading "${loadChannel}":`, err);
        error.value = err instanceof Error ? err.message : String(err);
        status.value = "error";
        loadedPromise = undefined;
        throw err;
      } finally {
        if (generation === requestGeneration && status.value === "loading") {
          status.value = "idle";
        }
        if (generation === requestGeneration) loadedPromise = undefined;
      }
    })();

    return loadedPromise;
  };

  const save = async (newValue: T): Promise<void> => {
    if (!agent.isReady.value || !api.isConnected()) {
      const unavailable = new Error("API is not connected");
      error.value = unavailable.message;
      throw unavailable;
    }

    if (!loaded.value) throw new Error(`Cannot save ${saveChannel} before loading persisted data`);

    const generation = requestGeneration;
    try {
      const result = await api.execute(saveChannel as any, { data: newValue });
      if (generation !== requestGeneration || !agent.isReady.value) {
        throw new Error("Agent disconnected before the save completed");
      }
      if (result.type === "error") {
        throw new Error(result.ipcError || `Unable to save ${saveChannel}`);
      }
      data.value = newValue;
    } catch (err) {
      console.error(`[useConfig] error saving "${saveChannel}":`, err);
      throw err;
    }
  };

  const reset = async (key: keyof T): Promise<void> => {
    if (agent.isReady.value && api.isConnected() && loaded.value) {
      try {
        const result = await api.execute(resetChannel as any, { key: String(key) });
        if (result.type === "success") {
          await load(true);
        } else {
          console.error(
            `[useConfig] failed to reset key "${String(key)}" of "${resetChannel}":`,
            result.ipcError,
          );
        }
      } catch (err) {
        console.error(
          `[useConfig] error resetting key "${String(key)}" of "${resetChannel}":`,
          err,
        );
      }
    }
  };

  return {
    data,
    status: readonly(status),
    loaded,
    requested: readonly(requested),
    loading: computed(() => status.value === "loading"),
    error: readonly(error),
    load,
    save,
    reset,
  };
}

export const useSettingsConfig = () => {
  return createConfigComposable<AppConfig>(
    "settings:load",
    "settings:save",
    "settings:reset",
    defaultAppSettings,
  );
};

export const useConnectionsConfig = () => {
  return createConfigComposable<ConnectionsConfig>(
    "connections:load",
    "connections:save",
    "connections:reset",
    defaultConnections,
  );
};

export const useProjectsConfig = () => {
  return createConfigComposable<FileRepo>(
    "projects:load",
    "projects:save",
    "projects:reset",
    defaultFileRepo,
  );
};
