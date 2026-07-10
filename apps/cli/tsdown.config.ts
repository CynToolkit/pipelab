import { defineConfig } from "tsdown";
import { resolve } from "path";
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

const envFile = resolve(import.meta.dirname, "../../.env");

config({ path: envFile });

const pkgPath = resolve(import.meta.dirname, "./package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  shims: true,
  env: {
    NODE_ENV: process.env.NODE_ENV || "production",
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || "",
    CLI_VERSION: pkg.version,
  },
  envFile: existsSync(envFile) ? envFile : undefined,
  envPrefix: ["SUPABASE_", "POSTHOG_", "NODE_ENV", "CLI_VERSION"],
  deps: {
    alwaysBundle: [/.*/],
  },
});
