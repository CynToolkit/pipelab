import { fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
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
  const promises = DEFAULT_PLUGIN_IDS.map(async (id) => {
    try {
      const packageName = `@pipelab/plugin-${id}`;

      let pluginModule;
      if (isDev && projectRoot) {
        try {
          // In dev, load directly from the plugins/ directory
          const pluginPath = join(projectRoot, "plugins", `plugin-${id}`, "dist", "index.mjs");
          pluginModule = await import(pathToFileURL(pluginPath).href);
          return pluginModule.default;
        } catch (e) {
          console.warn(
            `[Plugins] Could not load "${packageName}" from plugins/ folder in dev, falling back to download...`,
          );
        }
      }

      const pluginDir = await fetchPipelabPlugin(packageName);
      const pluginPath = join(pluginDir, "dist", "index.mjs");
      pluginModule = await import(pathToFileURL(pluginPath).href);
      return pluginModule.default;
    } catch (e) {
      console.error(`[Plugins] Failed to load default plugin "${id}":`, e);
      return null;
    }
  });

  const plugins = await Promise.all(promises);
  return plugins.filter(Boolean).flat();
};
