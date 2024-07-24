import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { pluginExposeRenderer } from './vite.base.config';
import tsconfigPaths from 'vite-tsconfig-paths'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import vitePluginVueDevtool from 'vite-plugin-vue-devtools'
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  const name = forgeConfigSelf.name ?? '';

  const environment = loadEnv(env.mode, process.cwd(), '')

  const plugins = [
    pluginExposeRenderer(name),
    tsconfigPaths(),
    vue(),
    Components({
      resolvers: [
        PrimeVueResolver()
      ]
    }),
    vitePluginVueDevtool(),
    // nodePolyfills(),
  ]

  if (environment.mode === "production") {
    sentryVitePlugin({
      org: "armaldio",
      project: "cyn",
      authToken: environment.SENTRY_AUTH_TOKEN,
    })
  }

  return {
    root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`,
      sourcemap: true,
    },
    optimizeDeps: {
      include: ['@codemirror/state', '@codemirror/view'],
    },
    plugins,
    resolve: {
      preserveSymlinks: true,
    },
    clearScreen: false,
  } as UserConfig;
});
