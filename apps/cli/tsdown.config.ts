import { defineConfig } from "tsdown";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "node:fs";

const envFile = resolve(import.meta.dirname, "../../.env");

export default defineConfig({
  entry: ["src/index.ts"],
  env: {
    NODE_ENV: process.env.NODE_ENV || "production",
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || "",
  },
  envFile: existsSync(envFile) ? envFile : undefined,
  envPrefix: ["SUPABASE_", "POSTHOG_", "NODE_ENV"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  alias: {
    electron: resolve(import.meta.dirname, "assets/shims/electron.ts"),
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
