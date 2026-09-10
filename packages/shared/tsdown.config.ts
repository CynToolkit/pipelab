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
});
