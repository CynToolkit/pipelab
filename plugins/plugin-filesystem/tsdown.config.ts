import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    resolver: "tsc",
    tsconfigRaw: {
      references: [],
    },
  },
  clean: true,
  shims: true,
  loader: {
    ".webp": "dataurl",
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".svg": "dataurl",
  },
  deps: {
    alwaysBundle: [/.*/],
  },
});
