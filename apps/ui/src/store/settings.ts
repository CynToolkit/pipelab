import { defineStore } from "pinia";
import { AppConfig } from "@pipelab/shared";
import { readonly, watch } from "vue";
import { useAuth } from "./auth";
import { useSettingsConfig } from "@renderer/composables/useConfig";

export const useAppSettings = defineStore("settings", () => {
  const auth = useAuth();
  const { data: settings, load, save, reset: resetConfig } = useSettingsConfig();

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
  watch(
    () => auth.user,
    () => {
      load();
    },
  );

  return { init, updateSettings, settings: settings, reset, load };
});
