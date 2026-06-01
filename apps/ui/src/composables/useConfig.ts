import { ref, readonly } from "vue";
import { useAPI } from "./api";
import {
  AppConfig,
  ConnectionsConfig,
  FileRepo,
  SavedFile,
  defaultAppSettings,
  defaultConnections,
  defaultFileRepo,
} from "@pipelab/shared";

const isElectron = typeof window !== "undefined" && !!window.electron;

const defaultPipelineValue: SavedFile = {
  version: "5.0.0",
  name: "",
  description: "",
  canvas: {
    blocks: [],
    triggers: [],
  },
  variables: [],
};

function createConfigComposable<T>(name: string, defaultValue: T) {
  const api = useAPI();
  const data = ref<T>(defaultValue);
  const loading = ref(false);
  let loadedPromise: Promise<void> | null = null;

  const load = async (force = false): Promise<void> => {
    if (loadedPromise && !force) {
      return loadedPromise;
    }

    loadedPromise = (async () => {
      console.log(`[useConfig] load "${name}": isElectron =`, isElectron);
      if (!isElectron) {
        return;
      }

      if (!api.isConnected()) {
        console.warn(`[useConfig] API not connected for loading "${name}"`);
        loadedPromise = null;
        return;
      }

      loading.value = true;
      try {
        const result = await api.execute("config:load", { config: name });
        if (result.type === "success") {
          const loadedValue: T = result.result.result;
          data.value = loadedValue;
        } else {
          console.error(`[useConfig] failed to load "${name}":`, result.ipcError);
        }
      } catch (err) {
        console.error(`[useConfig] error loading "${name}":`, err);
      } finally {
        loading.value = false;
      }
    })();

    return loadedPromise;
  };

  const save = async (newValue: T): Promise<void> => {
    data.value = newValue;
    if (isElectron && api.isConnected()) {
      try {
        const result = await api.execute("config:save", { config: name, data: newValue });
        if (result.type === "error") {
          console.error(`[useConfig] failed to save "${name}":`, result.ipcError);
        }
      } catch (err) {
        console.error(`[useConfig] error saving "${name}":`, err);
      }
    }
  };

  const reset = async (key: keyof T): Promise<void> => {
    if (isElectron && api.isConnected()) {
      try {
        const result = await api.execute("config:reset", { config: name, key: String(key) });
        if (result.type === "success") {
          await load(true);
        } else {
          console.error(
            `[useConfig] failed to reset key "${String(key)}" of "${name}":`,
            result.ipcError,
          );
        }
      } catch (err) {
        console.error(`[useConfig] error resetting key "${String(key)}" of "${name}":`, err);
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
  return createConfigComposable<AppConfig>("settings", defaultAppSettings);
};

export const useConnectionsConfig = () => {
  return createConfigComposable<ConnectionsConfig>("connections", defaultConnections);
};

export const useProjectsConfig = () => {
  return createConfigComposable<FileRepo>("projects", defaultFileRepo);
};

export const usePipelineConfig = (configNameOrPath: string) => {
  return createConfigComposable<SavedFile>(configNameOrPath, defaultPipelineValue);
};
