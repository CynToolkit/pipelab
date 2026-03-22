import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from "./vite.base.config.mjs";
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
        formats: ["cjs"],
      },
      rollupOptions: {
        external: [
          ...external.filter((dep) => {
            const isPipelab = dep.startsWith("@pipelab/");
            const isElectronToolkit = dep.startsWith("@electron-toolkit/");
            const isWs = dep === "ws";
            const isSquirrel = dep === "electron-squirrel-startup";
            return !isPipelab && !isElectronToolkit && !isWs && !isSquirrel;
          }),
          "bufferutil",
          "utf-8-validate",
        ],
      },
    },
    plugins,
    define: {
      ...define,
      __POSTHOG_API_KEY__: JSON.stringify(environment.POSTHOG_API_KEY),
      __SUPABASE_URL__: JSON.stringify(environment.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(environment.SUPABASE_ANON_KEY),
    },
    ssr: {
      // Ensure we target Node.js for the main process
      target: "node",
    },
    resolve: {
      // Load the Node.js entry.
      mainFields: ["module", "jsnext:main", "jsnext"],
      conditions: ["node"],
      alias: {
        "@pipelab": resolve(__dirname, "../../packages/shared/src/libs"),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
