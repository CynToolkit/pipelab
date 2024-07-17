import { defineConfig } from 'vitest/config'

// @ts-expect-error
import renderer from './vite.renderer.config'

export default defineConfig({
  ...renderer,
  test: {}
})
