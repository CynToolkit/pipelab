import { defineConfig } from 'tsup'
import { wasmLoader } from 'esbuild-plugin-wasm'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/apis.ts',
    'src/build-history.ts',
    'src/config.schema.ts',
    'src/database.types.ts',
    'src/evaluator.ts',
    'src/fmt.ts',
    'src/graph.ts',
    'src/i18n-utils.ts',
    'src/index.ts',
    'src/logger.ts',
    'src/model.ts',
    'src/plugins.ts',
    'src/quickjs.ts',
    'src/save-location.ts',
    'src/subscription-errors.ts',
    'src/supabase.ts',
    'src/types.ts',
    'src/utils.ts',
    'src/validation.ts',
    'src/variables.ts',
    'src/websocket.types.ts',
    'src/config/index.ts',
    'src/i18n/index.ts',
    'src/libs/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  tsconfig: './tsconfig.json',
  esbuildPlugins: [wasmLoader()],
  external: [
    '@pipelab/migration',
    '@pipelab/plugin-core',
    'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
    'chromium-bidi/lib/cjs/cdp/CdpConnection',
    '@jitl/quickjs-wasmfile-release-sync/wasm',
    '@jitl/quickjs-wasmfile-release-sync/wasm?url'
  ]
})
