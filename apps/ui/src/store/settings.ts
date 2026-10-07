import { defineStore } from "pinia";
import { AppConfig } from "@pipelab/shared";
import { watch } from "vue";
import { useAuth } from "./auth";
import { useSettingsConfig } from "@renderer/composables/useConfig";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";

export const useAppSettings = defineStore("settings", () => {
  const auth = useAuth();
  const agent = useAgentAvailability();
  const {
    data: settings,
    load,
    save,
    reset: resetConfig,
    status,
    error,
    loaded,
    requested,
  } = useSettingsConfig();

  const init = async () => {
    await load();
  };

  const updateSettings = async (_settings: AppConfig) => {
    await save(_settings);
  };

  const reset = async (key: keyof AppConfig) => {
    await resetConfig(key);
  };

  // Reload settings when auth state changes (for cloud save)
  watch([() => auth.user, agent.isReady], ([user, ready], previous) => {
    if (requested.value && ready && (user !== previous?.[0] || !previous?.[1])) {
      void load(user !== previous?.[0]).catch(() => undefined);
    }
  });

  return { init, updateSettings, settings, reset, load, status, error, loaded, requested };
});
