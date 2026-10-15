import { reactive } from "vue";
import type { Locales } from "@pipelab/shared";

export interface BrowserPreferences {
  theme: "light" | "dark";
  locale: Locales;
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const supportedLocales: Locales[] = ["en-US", "fr-FR", "pt-BR", "zh-CN", "es-ES", "de-DE"];
const defaultPreferences: BrowserPreferences = { theme: "light", locale: "en-US" };

const browserStorage = (): PreferenceStorage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const readBrowserPreferences = (
  storage: Pick<Storage, "getItem"> | undefined = browserStorage(),
): BrowserPreferences => {
  if (!storage) return { ...defaultPreferences };
  try {
    const theme = storage.getItem("pipelab.theme");
    const locale = storage.getItem("pipelab.locale");
    return {
      theme: theme === "dark" || theme === "light" ? theme : defaultPreferences.theme,
      locale: supportedLocales.includes(locale as Locales)
        ? (locale as Locales)
        : defaultPreferences.locale,
    };
  } catch {
    return { ...defaultPreferences };
  }
};

export const browserPreferences = reactive(readBrowserPreferences());

export const saveBrowserPreference = <Key extends keyof BrowserPreferences>(
  key: Key,
  value: BrowserPreferences[Key],
  storage: Pick<Storage, "setItem"> | undefined = browserStorage(),
): boolean => {
  if (!storage) return false;
  try {
    storage.setItem(`pipelab.${key}`, value);
  } catch {
    return false;
  }
  browserPreferences[key] = value;
  return true;
};
