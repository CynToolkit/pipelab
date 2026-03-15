import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, mergeConfig } from "vite";
import { getBuildConfig, external, pluginHotRestart } from "./vite.base.config.mjs";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<"build">;
  const { forgeConfigSelf } = forgeEnv;
  const config: UserConfig = {
    build: {
      rollupOptions: {
        external: external.filter((dep) => !dep.startsWith("@pipelab/")),
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: forgeConfigSelf?.entry || "src/preload.ts",
        output: {
          format: "cjs",
          // It should not be split chunks.
          inlineDynamicImports: true,
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name].[ext]",
        },
      },
    },
    plugins: [
      pluginHotRestart("reload"),
      tsconfigPaths({
        projects: ["./tsconfig.json"],
      }),
    ],
    resolve: {
      alias: {
        "@pipelab/shared": resolve(__dirname, "../../packages/shared/src"),
        "@pipelab/constants": resolve(__dirname, "../../packages/constants/src/index.ts"),
        "@pipelab": resolve(__dirname, "../../packages/shared/src/libs"),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
