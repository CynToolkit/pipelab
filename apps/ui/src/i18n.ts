import { MessageSchema, Locales, en_US, fr_FR, pt_BR, zh_CN, es_ES, de_DE } from "@pipelab/shared";
import { createI18n } from "vue-i18n";

export const i18n = createI18n<[MessageSchema], Locales>({
  legacy: false,
  locale: "en-US",
  fallbackLocale: "en-US",
  messages: {
    "en-US": en_US,
    "fr-FR": fr_FR,
    "pt-BR": pt_BR,
    "zh-CN": zh_CN,
    "es-ES": es_ES,
    "de-DE": de_DE,
  },
});
