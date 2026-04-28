import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from "./vite.base.config.mts";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<"build">;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const rootPath = resolve(__dirname, "../../");
  const environment = loadEnv(env.mode, rootPath, "");

  const plugins = [
    pluginHotRestart("restart"),
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ];

  // check if we are in a tag
  const tag = process.env.GITHUB_REF?.includes("refs/tags/");
  console.log("tag", tag);

  const config: UserConfig = {
    envDir: rootPath,
    build: {
      sourcemap: true,
      rollupOptions: {
        input: forgeConfigSelf?.entry || "src/main.ts",
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name].[ext]",
        },
        external: [
          ...external.filter((dep) => {
            const isPipelab = dep.startsWith("@pipelab/");
            const isElectronToolkit = dep.startsWith("@electron-toolkit/");
            const isSquirrel = dep === "electron-squirrel-startup";
            return !isPipelab && !isElectronToolkit && !isSquirrel;
          }),
          "bufferutil",
          "utf-8-validate",
        ],
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
