import { defineConfig } from "tsdown";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  alias: {
    "@pipelab/core-node/api": resolve(import.meta.dirname, "../../packages/core-node/src/api.ts"),
    "@pipelab/core-node/src/heavy": resolve(import.meta.dirname, "../../packages/core-node/src/heavy.ts"),
    "@pipelab/migration/projects": resolve(import.meta.dirname, "../../packages/migration/src/projects.ts"),
    "@pipelab/migration/settings": resolve(import.meta.dirname, "../../packages/migration/src/settings.ts"),
    "@pipelab/migration/model": resolve(import.meta.dirname, "../../packages/migration/src/model.ts"),
    "@pipelab/migration": resolve(import.meta.dirname, "../../packages/migration/src/index.ts"),
  },
  deps: {
    neverBundle: [
      "playwright",
      "playwright-core",
      "ws",
      "esbuild",
      "execa",
      "archiver",
      "tar",
      "yauzl",
      "semver",
      "electron",
      "@lydell/node-pty",
      "@jitl/quickjs-wasmfile-release-sync",
      /\.webp$/,
      /\?url$/,
    ],
    alwaysBundle: [/^@pipelab\/.*/, "serve-handler", "slash", "nanoid"],
  },
  target: false,
});