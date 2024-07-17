import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
  StaticJSValue
} from 'quickjs-emscripten'
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

const isRenderer = () => {
  // running in a web browser
  if (typeof process === 'undefined') return true

  // node-integration is disabled
  if (!process) return true

  // @ts-expect-error
  return process.browser === true || process.title === 'browser'
};

export const createQuickJs = async () => {
  let location: string
  if (isRenderer()) {
    location = (await import('@jitl/quickjs-wasmfile-release-sync/wasm?url')).default
  } else {
    const { join } = await import('node:path')
    const { dirname } = await import('@main/paths')
    const _dirname = await dirname()
    location = join(_dirname, 'emscripten-module.wasm')
  }

  console.log('location', location)

  const variant = newVariant(RELEASE_SYNC, {
    wasmLocation: location
  })
  const quickjs = await newQuickJSWASMModuleFromVariant(variant)

  const run = (code: string, params: Record<string, unknown>) => {
    const vm = quickjs.newContext()
    const arena = new Arena(vm, { isMarshalable: true })

    const exposed = {
      console: {
        log: console.log
      },
      fmt: {
        param: (value: string, variant?: 'primary' | 'secondary' | undefined) => {
          return `<div class=\"param ${variant ? variant : ''}\">${value}</div>`
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
      console.error('error', e)
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
