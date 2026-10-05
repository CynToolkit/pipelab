import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    construct: "src/construct/index.ts",
    electron: "src/electron/index.ts",
    godot: "src/godot/index.ts",
    tauri: "src/tauri/index.ts",
    steam: "src/steam/index.ts",
    itch: "src/itch/index.ts",
    poki: "src/poki/index.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  shims: true,
  loader: {
    ".webp": "dataurl",
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".svg": "dataurl",
  },
  deps: { alwaysBundle: [/.*/] },
});
