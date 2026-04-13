import { useLogger } from "./logger";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
} from "quickjs-emscripten";
import { Arena } from "quickjs-emscripten-sync";
import { fmt } from "./fmt";

class EvaluationError extends Error {
  constructor(
    public name: string,
    public description: string,
  ) {
    super(description);
    this.name = name;
  }
}

/**
 * Creates a QuickJS instance from an already-resolved variant.
 * Callers are responsible for importing and passing the correct variant
 * for their environment (Node vs browser) using a static import.
 */
export const createQuickJsFromVariant = async (variant: any) => {
  const { logger } = useLogger();

  const quickjs = await newQuickJSWASMModuleFromVariant(variant);

  const createContext = () => {
    const vm = quickjs.newContext();
    const arena = new Arena(vm, { isMarshalable: true });

    const run = (code: string, params: Record<string, unknown>) => {
      const exposed = {
        fmt,
        ...params,
      };
      arena.expose(exposed);

      const finalCode = `(() => {
        return ${code};
      })()`;

      try {
        return arena.evalCode(finalCode);
      } catch (e) {
        logger().error("error", e);
        logger().error("Final code was", finalCode);
        throw new EvaluationError(e.name, e.message);
      }
    };

    return {
      run,
      dispose: () => {
        try {
          arena.dispose();
        } catch (e) {
          logger().error("Failed to dispose arena", e);
        }
        try {
          vm.dispose();
        } catch (e) {
          logger().error("Failed to dispose VM", e);
        }
      },
    };
  };

  const run = (code: string, params: Record<string, unknown>) => {
    const ctx = createContext();
    try {
      return ctx.run(code, params);
    } finally {
      try {
        ctx.dispose();
      } catch (e) {
        logger().error("Failed to dispose context", e);
      }
    }
  };

  return {
    run,
    createContext,
  };
};

// ---------------------------------------------------------------------------
// Node.js variant — statically imported, safe in the Electron main process
// ---------------------------------------------------------------------------
import nodeVariant from "@jitl/quickjs-wasmfile-release-sync";

export const createQuickJs = () => createQuickJsFromVariant(nodeVariant);

export type CreateQuickJSFn = ReturnType<typeof createQuickJs>;

// ---------------------------------------------------------------------------
// newVariant / RELEASE_SYNC re-exported for callers that build their own variant
// ---------------------------------------------------------------------------
export { newVariant, RELEASE_SYNC };
