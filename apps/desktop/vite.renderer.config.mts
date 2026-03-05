import type { ConfigEnv, UserConfig } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { pluginExposeRenderer } from './vite.base.config.mjs'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>
  const { root, mode, forgeConfigSelf } = forgeEnv
  const name = forgeConfigSelf.name ?? ''

  const plugins = [
    pluginExposeRenderer(name),
    tsconfigPaths({
      projects: ['./tsconfig.json']
    })
  ]

  return {
    root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`,
      sourcemap: true
    },
    plugins,
    clearScreen: false
  } as UserConfig
})
