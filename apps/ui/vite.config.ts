import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import AutoImport from "unplugin-auto-import/vite";
import VueDevTools from "vite-plugin-vue-devtools";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 5173,
      strictPort: true,
    },
    plugins: [
      mode === "development" && VueDevTools(),
      vue(),
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
      tsconfigPaths: true,
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
      },
    },
  };
});
