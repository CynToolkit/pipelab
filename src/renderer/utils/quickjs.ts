import { useLogger } from '@@/logger'
import { isRenderer } from '@@/validation'
import { newQuickJSWASMModuleFromVariant, newVariant, RELEASE_SYNC } from 'quickjs-emscripten'
import { Arena } from 'quickjs-emscripten-sync'

class EvaluationError extends Error {
  constructor(
    public name: string,
    public description: string
  ) {
    super(description)
    this.name = name
  }
}

export const createQuickJs = async () => {
  const { logger } = useLogger()

  let location: string
  if (isRenderer()) {
    location = (await import('@jitl/quickjs-wasmfile-release-sync/wasm?url')).default
  } else {
    const { join } = await import('node:path')
    const { dirname } = await import('@main/paths')
    const _dirname = await dirname()
    location = join(_dirname, 'emscripten-module.wasm')
  }

  const variant = newVariant(RELEASE_SYNC, {
    wasmLocation: location
  })
  const quickjs = await newQuickJSWASMModuleFromVariant(variant)

  const run = (code: string, params: Record<string, unknown>) => {
    const vm = quickjs.newContext()
    const arena = new Arena(vm, { isMarshalable: true })

    const exposed = {
      console: {
        // eslint-disable-next-line no-console
        log: console.log
      },
      fmt: {
        param: (value: string, variant?: 'primary' | 'secondary' | undefined) => {
          return `<div class="param ${variant ? variant : ''}">${value}</div>`
        }
      },
      ...params
    }
    arena.expose(exposed)

    // const finalCode = `export const result = ${code}`
    const finalCode = `(() => {
      // console.log('params', params);
      // console.log('params.parameters', params.parameters);

      return ${code};
  })()
    `

    try {
      const result = arena.evalCode(finalCode)

      return result
    } catch (e) {
      logger().error('error', e)
      throw new EvaluationError(e.name, e.message)
    } finally {
      arena.dispose()
      vm.dispose()
    }
  }

  return {
    run
  }
}

export type CreateQuickJSFn = ReturnType<typeof createQuickJs>
