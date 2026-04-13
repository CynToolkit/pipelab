/**
 * Browser/renderer entry point for QuickJS.
 *
 * Uses the Vite `?url` static import to resolve the WASM file URL at build
 * time — no dynamic import() required.  Import this module only from code
 * that runs in the Electron renderer process or a browser environment.
 */
// @ts-ignore — the `?url` suffix is a Vite-only feature; TS doesn't know it
import wasmLocation from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import { newVariant, RELEASE_SYNC } from "quickjs-emscripten";
import { createQuickJsFromVariant } from "./quickjs";

const browserVariant = newVariant(RELEASE_SYNC, { wasmLocation });

export const createQuickJsBrowser = () => createQuickJsFromVariant(browserVariant);
