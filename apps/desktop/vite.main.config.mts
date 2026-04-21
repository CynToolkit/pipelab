import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from "./vite.base.config.mts";
import tsconfigPaths from "vite-tsconfig-paths";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "path";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<"build">;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const environment = loadEnv(env.mode, process.cwd(), "");

  const plugins = [
    pluginHotRestart("restart"),
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ];

  // check if we are in a tag
  const tag = process.env.GITHUB_REF?.includes("refs/tags/");
  console.log("tag", tag);
  if (tag) {
    plugins.push(
      sentryVitePlugin({
        org: "armaldio",
        project: "cyn",
        authToken: environment.SENTRY_AUTH_TOKEN,
      }),
    );
  }

  const config: UserConfig = {
    build: {
      sourcemap: true,
      lib: {
        entry: forgeConfigSelf?.entry || "src/main.ts",
        fileName: () => "[name].js",
        formats: ["es"],
      },
      rollupOptions: {
        external: [
          ...external.filter((dep) => {
            const isPipelab = dep.startsWith("@pipelab/");
            const isElectronToolkit = dep.startsWith("@electron-toolkit/");
            return !isPipelab && !isElectronToolkit;
          }),
          "bufferutil",
          "utf-8-validate",
        ],
        output: {
          banner:
            'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
        },
      },
    },
    plugins,
    define: {
      ...define,
      "process.env.POSTHOG_API_KEY": JSON.stringify(environment.POSTHOG_API_KEY),
      "process.env.SUPABASE_URL": JSON.stringify(environment.SUPABASE_URL),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(environment.SUPABASE_ANON_KEY),
    },
    ssr: {
      // Ensure we target Node.js for the main process
      target: "node",
    },
    resolve: {
      // Load the Node.js entry.
      mainFields: ["module", "jsnext:main", "jsnext"],
      conditions: ["node"],
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
