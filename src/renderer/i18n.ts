import { MessageSchema, Locales, en_US, fr_FR, pt_BR, zh_CN, es_ES, de_DE } from '@@/i18n-utils'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n<[MessageSchema], Locales>({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: {
    'en-US': en_US,
    'fr-FR': fr_FR as unknown as MessageSchema,
    'pt-BR': pt_BR as unknown as MessageSchema,
    'zh-CN': zh_CN as unknown as MessageSchema,
    'es-ES': es_ES as unknown as MessageSchema,
    'de-DE': de_DE as unknown as MessageSchema
  }
})
