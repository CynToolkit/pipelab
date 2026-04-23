import { fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { isDev, projectRoot } from "./context";

const DEFAULT_PLUGIN_IDS = [
  "construct",
  "filesystem",
  "system",
  "steam",
  "itch",
  "electron",
  "discord",
  "poki",
  "nvpatch",
  "tauri",
  "minify",
  "netlify",
];

export const builtInPlugins = async (options?: { nodePath?: string; pnpmPath?: string }) => {
  console.log("[Plugins] Finalizing default plugins list...");
  const promises = DEFAULT_PLUGIN_IDS.map(async (id) => {
    try {
      const packageName = `@pipelab/plugin-${id}`;
      // console.log(`[Plugins] [${id}] Attempting to resolve...`);

      let pluginModule;
      if (isDev && projectRoot) {
        try {
          // In dev, load directly from the plugins/ directory
          let pluginPath = join(projectRoot, "plugins", `plugin-${id}`, "src", "index.ts");
          if (!existsSync(pluginPath)) {
            pluginPath = join(projectRoot, "plugins", `plugin-${id}`, "dist", "index.mjs");
          }
          pluginModule = await import(pathToFileURL(pluginPath).href);
          console.log(`[Plugins] [${id}] Loaded from local source: ${pluginPath}`);
          return pluginModule.default;
        } catch (e) {
          console.warn(
            `[Plugins] [${id}] Could not load from local source, falling back to cached package...`,
          );
        }
      }

      const pluginDir = await fetchPipelabPlugin(packageName, undefined, {
        nodePath: options?.nodePath,
        pnpmPath: options?.pnpmPath,
      });
      const pluginPath = join(pluginDir, "dist", "index.mjs");
      
      console.log(`[Plugins] [${id}] Attempting to import from: ${pluginPath}`);
      if (!existsSync(pluginPath)) {
        console.error(`[Plugins] [${id}] CRITICAL: Plugin entry point not found at ${pluginPath}`);
        // Optionally list files in the directory to see what's there
        try {
          const files = await readdir(pluginDir, { recursive: true });
          console.log(`[Plugins] [${id}] Directory contents:`, files);
        } catch (e) {}
      }

      pluginModule = await import(pathToFileURL(pluginPath).href);
      console.log(`[Plugins] [${id}] Successfully loaded from: ${pluginDir}`);
      return pluginModule.default;
    } catch (e: any) {
      console.error(`[Plugins] [${id}] CRITICAL: Failed to load:`, e);
      if (e.code === "ERR_MODULE_NOT_FOUND") {
        console.error(`[Plugins] [${id}] This usually means a dependency is missing in the plugin's node_modules.`);
      }
      return null;
    }
  });

  const plugins = await Promise.all(promises);
  const filtered = plugins.filter(Boolean).flat();
  console.log(`[Plugins] Successfully loaded ${filtered.length} default plugins`);
  return filtered;
};
