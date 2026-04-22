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

export const builtInPlugins = async () => {
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

      const pluginDir = await fetchPipelabPlugin(packageName);
      const pluginPath = join(pluginDir, "dist", "index.mjs");
      
      // console.log(`[Plugins] [${id}] Importing from: ${pluginPath}`);
      pluginModule = await import(pathToFileURL(pluginPath).href);
      console.log(`[Plugins] [${id}] Successfully loaded from: ${pluginDir}`);
      return pluginModule.default;
    } catch (e) {
      console.error(`[Plugins] [${id}] CRITICAL: Failed to load:`, e);
      return null;
    }
  });

  const plugins = await Promise.all(promises);
  const filtered = plugins.filter(Boolean).flat();
  console.log(`[Plugins] Successfully loaded ${filtered.length} default plugins`);
  return filtered;
};
