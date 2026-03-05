import { defineStore } from 'pinia'
import { useAPI } from '@renderer/composables/api'
import { AppConfig } from '@pipelab/shared/config.schema'
import { readonly, ref, watch } from 'vue'
import { useAuth } from './auth'
import { supabase as supabaseFn } from '@pipelab/shared/supabase'

export const useAppSettings = defineStore('settings', () => {
  const api = useAPI()
  const auth = useAuth()

  const settings = ref<AppConfig>({
    theme: 'light',
    version: '7.0.0',
    cacheFolder: '',
    clearTemporaryFoldersOnPipelineEnd: false,
    locale: 'en-US',
    tours: {
      dashboard: { step: 0, completed: false },
      editor: { step: 0, completed: false }
    },
    autosave: true,
    agents: []
  })

  const isElectron = !!window.electron

  const init = async () => {
    await load()
  }

  const load = async () => {
    console.log('[Settings] load: isElectron', isElectron)

    // 1. If Electron, load from the local embedded agent
    if (isElectron) {
      if (api.isConnected()) {
        console.log('[Settings] loading from local agent')
        const result = await api.execute('settings:load')
        if (result.type === 'success') {
          settings.value = result.result.result
        }
      } else {
        console.log('[Settings] local agent not connected yet')
      }
      return
    }

    // 2. If Web and Logged In, load from Supabase (Cloud Save)
    if (auth.user) {
      console.log('[Settings] loading from Supabase')
      const supabase = supabaseFn()
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', auth.user.id)
        .single()

      if (data && !error) {
        settings.value = {
          ...settings.value,
          ...data.settings
        }
        return
      } else if (error) {
        console.warn('[Settings] Failed to load from Supabase:', error)
      }
    }

    // 3. Fallback: If not connected or not logged in, we stay with default/current settings
    // (Note: No localStorage as requested)
  }

  const updateSettings = async (_settings: AppConfig) => {
    settings.value = _settings

    // 1. If Electron, save to the local agent
    if (isElectron && api.isConnected()) {
      await api.execute('settings:save', _settings)
    }

    // 2. If Web and Logged In, save to Supabase
    if (!isElectron && auth.user) {
      const supabase = supabaseFn()
      await supabase.from('user_settings').upsert({
        user_id: auth.user.id,
        settings: _settings,
        updated_at: new Date().toISOString()
      })
    }
  }

  const reset = async (key: keyof AppConfig) => {
    if (isElectron && api.execute) {
      await api.execute('settings:reset', { key })
      await load()
    } else {
      // Manual reset for web/non-connected state
    }
  }

  // Reload settings when auth state changes (for cloud save)
  watch(
    () => auth.user,
    () => {
      load()
    }
  )

  return { init, updateSettings, settings: readonly(settings), reset, load }
})
