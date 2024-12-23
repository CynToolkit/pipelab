import type { ConfigEnv, UserConfig } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { pluginExposeRenderer } from './vite.base.config'
import tsconfigPaths from 'vite-tsconfig-paths'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import vitePluginVueDevtool from 'vite-plugin-vue-devtools'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import packageConfig from './package.json' with { type: 'json' }

const codemirrorDeps = Object.entries(packageConfig.dependencies)
  .map(([key, value]) => {
    return key
  })
  .filter((predicate) => predicate.startsWith('@codemirror/'))

// https://vitejs.dev/config
export default defineConfig((env) => {
  console.log('env', env)
  const forgeEnv = env as ConfigEnv<'renderer'>
  const { root, mode, forgeConfigSelf } = forgeEnv
  const name = forgeConfigSelf.name ?? ''

  const environment = loadEnv(env.mode, process.cwd(), '')

  console.log('environment.SUPABASE_URL', environment.SUPABASE_URL)

  const plugins = [
    pluginExposeRenderer(name),
    tsconfigPaths(),
    vue(),
    Components({
      resolvers: [PrimeVueResolver()]
    }),
    vitePluginVueDevtool()
    // nodePolyfills(),
  ]

  const tag = process.env.GITHUB_REF?.includes('refs/tags/')
  console.log('tag', tag)
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
      __SUPABASE_PROJECT_ID__: JSON.stringify(environment.SUPABASE_PROJECT_ID)
    },
    build: {
      outDir: `.vite/renderer/${name}`,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            codemirror: codemirrorDeps
          }
        }
      }
    },
    optimizeDeps: {
      exclude: [...codemirrorDeps]
    },
    plugins,
    resolve: {
      preserveSymlinks: true,
      dedupe: [...codemirrorDeps]
    },
    clearScreen: false
  } as UserConfig
})
