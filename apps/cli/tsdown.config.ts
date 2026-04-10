import { defineConfig } from "tsdown";
import { resolve, dirname } from "path";
import { readFileSync } from "node:fs";

const envFile = readFileSync(resolve(import.meta.dirname, "../../.env"), "utf-8");
const env: Record<string, string> = {};
envFile.split("\n").forEach((line) => {
  const [key, ...value] = line.split("=");
  if (key && value) {
    env[key.trim()] = value
      .join("=")
      .trim()
      .replace(/^"(.*)"$/, "$1");
  }
});

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  alias: {
    electron: resolve(import.meta.dirname, "assets/shims/electron.ts"),
  },
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY),
    "process.env.SUPABASE_PROJECT_ID": JSON.stringify(env.SUPABASE_PROJECT_ID),
    "process.env.POSTHOG_API_KEY": JSON.stringify(env.POSTHOG_API_KEY),
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
