import { ref, readonly } from "vue";
import { useAPI } from "./api";
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
  const data = ref<T>(defaultValue);
  const loading = ref(false);
  let loadedPromise: Promise<void> | null = null;

  const load = async (force = false): Promise<void> => {
    if (loadedPromise && !force) {
      return loadedPromise;
    }

    loadedPromise = (async () => {
      if (!api.isConnected()) {
        console.warn(`[useConfig] API not connected for loading "${loadChannel}"`);
        loadedPromise = null;
        return;
      }

      loading.value = true;
      try {
        const result = await api.execute(loadChannel as any);
        if (result.type === "success") {
          const loadedValue: T = result.result;
          data.value = loadedValue;
        } else {
          console.error(`[useConfig] failed to load "${loadChannel}":`, result.ipcError);
        }
      } catch (err) {
        console.error(`[useConfig] error loading "${loadChannel}":`, err);
      } finally {
        loading.value = false;
      }
    })();

    return loadedPromise;
  };

  const save = async (newValue: T): Promise<void> => {
    data.value = newValue;
    if (api.isConnected()) {
      try {
        const result = await api.execute(saveChannel as any, { data: newValue });
        if (result.type === "error") {
          console.error(`[useConfig] failed to save "${saveChannel}":`, result.ipcError);
        }
      } catch (err) {
        console.error(`[useConfig] error saving "${saveChannel}":`, err);
      }
    }
  };

  const reset = async (key: keyof T): Promise<void> => {
    if (api.isConnected()) {
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
    loading: readonly(loading),
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
