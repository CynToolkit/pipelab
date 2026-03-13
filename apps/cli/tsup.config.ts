import { defineConfig } from "tsup";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  noExternal: [/^@pipelab\/.*/, "serve-handler", "slash", "nanoid"],
  external: [
    "playwright",
    "playwright-core",
    "ws",
    "esbuild",
    "execa",
    "archiver",
    "tar",
    "yauzl",
    "semver",
    "@jitl/quickjs-wasmfile-release-sync",
  ],
  alias: {
    "@pipelab/core-node/api": resolve(__dirname, "../../packages/core-node/src/api.ts"),
    "@pipelab/core-node/src/heavy": resolve(__dirname, "../../packages/core-node/src/heavy.ts"),
  },
});
