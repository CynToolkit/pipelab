import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'

// https://vitejs.dev/config/
export default defineConfig((env) => {
  const environment = loadEnv(env.mode, process.cwd(), '')
  const plugins = [vue(), Icons()] as unknown as PluginOption[]

  return {
    plugins,
    server: {
      port: 3000
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      __SUPABASE_URL__: JSON.stringify(environment.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(environment.SUPABASE_ANON_KEY),
      __SUPABASE_PROJECT_ID__: JSON.stringify(environment.SUPABASE_PROJECT_ID),
    },
  }
})
