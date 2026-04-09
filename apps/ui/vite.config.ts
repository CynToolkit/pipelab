import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import AutoImport from "unplugin-auto-import/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 5173,
      strictPort: true,
    },
    plugins: [
      vue(),
      tsconfigPaths({
        projects: ["./tsconfig.json"],
      }),
      Components({
        resolvers: [PrimeVueResolver()],
      }),
      AutoImport({
        imports: ["vue", "vue-router", "pinia"],
        // We avoid PrimeVueResolver here because it causes name collisions
        // with project types like Steps, Message, etc.
        // resolvers: [PrimeVueResolver()]
      }),
    ],
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
      __SUPABASE_PROJECT_ID__: JSON.stringify(env.SUPABASE_PROJECT_ID),
      __POSTHOG_API_KEY__: JSON.stringify(env.POSTHOG_API_KEY),
    },
    optimizeDeps: {
      include: [
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/commands",
        "@codemirror/autocomplete",
        "@codemirror/lang-javascript",
      ],
    },
    build: {
      rollupOptions: {
        external: ["@pipelab/core-node"],
      },
    },
    resolve: {
      dedupe: [
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/commands",
        "@codemirror/autocomplete",
        "@codemirror/lang-javascript",
      ],
      alias: {
        "@renderer": resolve(__dirname, "src"),
        "@pipelab/shared": resolve(__dirname, "../../packages/shared/src"),
        "@pipelab/constants": resolve(__dirname, "../../packages/constants/src/index.ts"),
        "@pipelab/ui": resolve(__dirname, "src/main.ts"),
        "@pipelab/core-node": resolve(__dirname, "../../packages/core-node/src"),
        "@pipelab/migration": resolve(__dirname, "../../packages/migration/src"),
        "@pipelab": resolve(__dirname, "../../packages/shared/src/libs"),
      },
    },
  };
});
