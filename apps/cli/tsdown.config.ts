import { defineConfig } from "tsdown";
import { resolve, dirname } from "path";
import { readFileSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  alias: {
    "electron": resolve(import.meta.dirname, "assets/shims/electron.ts"),
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
      "@lydell/node-pty",
      "@jitl/quickjs-wasmfile-release-sync",
      /\?url$/,
    ],
    alwaysBundle: [/^@pipelab\/.*/, "serve-handler", "slash", "nanoid", "sliced", "deep-defaults"],
  },
  define: {
    "import.meta": "{}",
  },
  plugins: [
    {
      name: "webp-base64",
      resolveId(source, importer) {
        if (source.endsWith(".webp")) {
          return resolve(importer ? dirname(importer) : process.cwd(), source);
        }
      },
      load(id) {
        if (id.endsWith(".webp")) {
          const data = readFileSync(id).toString("base64");
          return `export default "data:image/webp;base64,${data}"`;
        }
      },
    },
  ],
  target: false,
});
