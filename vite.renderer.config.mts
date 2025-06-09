import type { ConfigEnv, UserConfig } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { pluginExposeRenderer } from './vite.base.config.mjs'
import tsconfigPaths from 'vite-tsconfig-paths'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import vitePluginVueDevtool from 'vite-plugin-vue-devtools'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>
  const { root, mode, forgeConfigSelf } = forgeEnv
  const name = forgeConfigSelf.name ?? ''

  const environment = loadEnv(env.mode, process.cwd(), '')

  const plugins = [
    pluginExposeRenderer(name),
    tsconfigPaths({
      projects: ['./tsconfig.json']
    }),
    vue(),
    Components({
      resolvers: [PrimeVueResolver()]
    }),
    vitePluginVueDevtool()
    // nodePolyfills(),
  ]

  const tag = process.env.GITHUB_REF?.includes('refs/tags/')
  if (tag) {
    plugins.push(
      sentryVitePlugin({
        org: 'armaldio',
        project: 'cyn',
        authToken: environment.SENTRY_AUTH_TOKEN
      })
    )
  }

  return {
    root,
    mode,
    base: './',
    define: {
      __SUPABASE_URL__: JSON.stringify(environment.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(environment.SUPABASE_ANON_KEY),
      __SUPABASE_PROJECT_ID__: JSON.stringify(environment.SUPABASE_PROJECT_ID),
      __POSTHOG_API_KEY__: JSON.stringify(environment.POSTHOG_API_KEY)
    },
    build: {
      outDir: `.vite/renderer/${name}`,
      sourcemap: true
    },
    optimizeDeps: {
      include: ['@codemirror/state', '@codemirror/view']
    },
    plugins,
    resolve: {
      preserveSymlinks: true
    },
    clearScreen: false
  } as UserConfig
})
