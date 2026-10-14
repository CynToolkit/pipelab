import { fileURLToPath, URL } from "node:url";

import { defineConfig, loadEnv, type Plugin, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { resolveSupabasePublishableKey } from "@pipelab/shared/supabase-key";

function cspConnectOrigins(supabaseUrl: string | undefined) {
  const origins = new Set([
    "'self'",
    "https://api.github.com",
    "https://cloud.umami.is",
    "https://tally.so",
  ]);

  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        origins.add(url.origin);
        origins.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
      }
    } catch {
      // An absent or malformed public URL should not broaden the policy.
    }
  }

  return [...origins].join(" ");
}

function reportOnlyCsp(supabaseUrl: string | undefined): Plugin {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' https://cloud.umami.is https://tally.so",
    "script-src-attr 'none'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'none'",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${cspConnectOrigins(supabaseUrl)}`,
    "frame-src 'self' https://www.youtube.com https://tally.so",
    "worker-src 'self'",
  ].join("; ");

  return {
    name: "hosted-website-csp-report-only",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `/*\n  Content-Security-Policy-Report-Only: ${policy}\n`,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig((env) => {
  const environment = loadEnv(env.mode, process.cwd(), "");
  const supabasePublishableKey = resolveSupabasePublishableKey(environment);
  const plugins = [
    vue(),
    Icons(),
    reportOnlyCsp(environment.SUPABASE_URL),
  ] as unknown as PluginOption[];

  return {
    plugins,
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    define: {
      __SUPABASE_URL__: JSON.stringify(environment.SUPABASE_URL),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
      __SUPABASE_PROJECT_ID__: JSON.stringify(environment.SUPABASE_PROJECT_ID),
    },
  };
});
