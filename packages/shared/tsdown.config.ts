import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    resolve: false,
    tsconfigRaw: {
      references: [],
    },
  },
  clean: true,
});
