import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import renderer from './vite.renderer.config.mjs'

export default defineConfig((configEnv) => {
  const baseConfig = renderer({
    ...configEnv,
    forgeConfigSelf: {
      name: 'Tests'
    }
  })

  return mergeConfig(
    baseConfig,
    defineConfig({
      // plugins: [tsconfigPaths()],
      test: {
        exclude: [...configDefaults.exclude, 'tests/e2e/**/*.spec.ts']
      }
    })
  )
})
