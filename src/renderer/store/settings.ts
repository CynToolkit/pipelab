import { defineStore } from 'pinia'
import { useAPI } from '@renderer/composables/api'
import { AppConfig } from '@main/config'
import { readonly, ref } from 'vue'

export const useAppSettings = defineStore('settings', () => {
  const api = useAPI()
  const settings = ref<AppConfig>()

  const init = async () => {
    const result = await api.execute('settings:load')
    if (result.type === 'error') {
      console.error(result)
    } else {
      settings.value = result.result.result
    }
  }

  const updateSettings = async (_settings: AppConfig) => {
    settings.value = _settings
    const result = await api.execute('settings:save', _settings)
    if (result.type === 'error') {
      console.error(result)
    }
  }

  return { init, updateSettings, settings: readonly(settings) }
})
