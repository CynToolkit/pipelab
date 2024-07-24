import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from './vite.base.config';
import tsconfigPaths from 'vite-tsconfig-paths'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);

  const environment = loadEnv(env.mode, process.cwd(), '')

  const plugins = [
    pluginHotRestart('restart'),
    tsconfigPaths(),
    viteStaticCopy({
      targets: [
        {
          src: 'assets',
          dest: '.',
        },
        {
          src: "node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm",
          dest: "."
        }
      ]
    }),
  ]

  if (environment.mode === "production") {
    sentryVitePlugin({
      org: "armaldio",
      project: "cyn",
      authToken: environment.SENTRY_AUTH_TOKEN,
    })
  }

  const config: UserConfig = {
    build: {
      sourcemap: true,
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
      rollupOptions: {
        external,
      },
    },
    plugins,
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
