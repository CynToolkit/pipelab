import { useLogger } from './logger'
import { isRenderer } from './validation'
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
  QuickJSContext
} from 'quickjs-emscripten'
import { Arena } from 'quickjs-emscripten-sync'
import { fmt } from './fmt'

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
    const nodePathPkg = 'node:path'
    const coreNodePkg = '@pipelab/core-node'
    const { join } = await import(nodePathPkg)
    const { dirname } = await import(coreNodePkg)
    const _dirname = await dirname()
    location = join(_dirname, 'emscripten-module.wasm')
  }

  const variant = newVariant(RELEASE_SYNC, {
    wasmLocation: location
  })
  const quickjs = await newQuickJSWASMModuleFromVariant(variant)

  const createContext = () => {
    const vm = quickjs.newContext()
    const arena = new Arena(vm, { isMarshalable: true })

    const run = (code: string, params: Record<string, unknown>) => {
      const exposed = {
        fmt,
        ...params
      }
      arena.expose(exposed)

      const finalCode = `(() => {
        return ${code};
      })()`

      try {
        return arena.evalCode(finalCode)
      } catch (e) {
        logger().error('error', e)
        logger().error('Final code was', finalCode)
        throw new EvaluationError(e.name, e.message)
      }
    }

    return {
      run,
      dispose: () => {
        try {
          arena.dispose()
        } catch (e) {
          logger().error('Failed to dispose arena', e)
        }
        try {
          vm.dispose()
        } catch (e) {
          logger().error('Failed to dispose VM', e)
        }
      }
    }
  }

  const run = (code: string, params: Record<string, unknown>) => {
    const ctx = createContext()
    try {
      return ctx.run(code, params)
    } finally {
      try {
        ctx.dispose()
      } catch (e) {
        logger().error('Failed to dispose context', e)
      }
    }
  }

  return {
    run,
    createContext
  }
}

export type CreateQuickJSFn = ReturnType<typeof createQuickJs>
