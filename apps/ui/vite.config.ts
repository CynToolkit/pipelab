import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import AutoImport from "unplugin-auto-import/vite";
import VueDevTools from "vite-plugin-vue-devtools";
import { uiDevPort } from "@pipelab/constants";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: uiDevPort,
      strictPort: true,
    },
    plugins: [
      {
        name: "disallow-core-node",
        resolveId(id) {
          if (id === "@pipelab/core-node" || id === "@pipelab/plugin-core") {
            throw new Error(
              `[Forbidden] Do not import ${id} in the UI project. These are Node.js only packages. Use @pipelab/shared for shared browser-safe code/types.`,
            );
          }
        },
      },
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
      "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY),
      "process.env.SUPABASE_PROJECT_ID": JSON.stringify(env.SUPABASE_PROJECT_ID),
      "process.env.POSTHOG_API_KEY": JSON.stringify(env.POSTHOG_API_KEY),
      "process.env.UI_VERSION": JSON.stringify(env.npm_package_version || "1.0.0"),
    },
    optimizeDeps: {
      exclude: ["@pipelab/core-node", "@pipelab/plugin-core"],
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
        external: ["@pipelab/core-node", "@pipelab/plugin-core"],
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
