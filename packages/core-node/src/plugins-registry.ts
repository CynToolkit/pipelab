import { fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isDev, projectRoot, PipelabContext } from "./context";

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

export const builtInPlugins = async (options: { context: PipelabContext }) => {
  console.log("[Plugins] Finalizing default plugins list...");
  const promises = DEFAULT_PLUGIN_IDS.map(async (id) => {
    try {
      const packageName = `@pipelab/plugin-${id}`;
      // console.log(`[Plugins] [${id}] Attempting to resolve...`);

      const { packageDir, entryPoint } = await fetchPipelabPlugin(packageName, "latest", {
        context: options.context,
        installDeps: true,
      });

      console.log(`[Plugins] [${id}] Attempting to import from: ${entryPoint}`);
      if (!existsSync(entryPoint)) {
        console.error(`[Plugins] [${id}] CRITICAL: Plugin entry point not found at ${entryPoint}`);
        // Optionally list files in the directory to see what's there
        try {
          const files = await readdir(packageDir, { recursive: true });
          console.log(`[Plugins] [${id}] Directory contents:`, files);
        } catch (e) { }
      }

      const pluginModule = await import(pathToFileURL(entryPoint).href);
      console.log(`[Plugins] [${id}] Successfully loaded from: ${packageDir}`);
      return pluginModule.default;
    } catch (e: any) {
      console.error(`[Plugins] [${id}] CRITICAL: Failed to load:`, e);
      if (e.code === "ERR_MODULE_NOT_FOUND") {
        console.error(
          `[Plugins] [${id}] This usually means a dependency is missing in the plugin's node_modules.`,
        );
      }
      return null;
    }
  });

  const plugins = await Promise.all(promises);
  const filtered = plugins.filter(Boolean).flat();
  console.log(`[Plugins] Successfully loaded ${filtered.length} default plugins`);
  return filtered;
};
