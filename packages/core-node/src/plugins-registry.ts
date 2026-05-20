import { ensureNodeJS, ensurePNPM, fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PipelabContext } from "./context";
import { sendStartupProgress } from "./server";

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

export const loadPipelabPlugin = async (id: string, options: { context: PipelabContext }) => {
  const start = Date.now();
  try {
    const packageName = `@pipelab/plugin-${id}`;
    const fetchStart = Date.now();
    const { packageDir, entryPoint } = await fetchPipelabPlugin(
      packageName,
      options.context.releaseTag,
      {
        context: options.context,
        installDeps: false,
      },
    );
    const fetchDuration = Date.now() - fetchStart;

    console.log(`[Plugins] [${id}] Attempting to import from: ${entryPoint}`);
    if (!existsSync(entryPoint)) {
      console.error(`[Plugins] [${id}] CRITICAL: Plugin entry point not found at ${entryPoint}`);
      try {
        const files = await readdir(packageDir, { recursive: true });
        console.log(`[Plugins] [${id}] Directory contents:`, files);
      } catch (e) {}
    }

    const importStart = Date.now();
    const pluginModule = await import(pathToFileURL(entryPoint).href);
    const importDuration = Date.now() - importStart;
    const totalDuration = Date.now() - start;
    console.log(
      `[Plugins] [${id}] Successfully loaded from: ${packageDir} (fetch: ${fetchDuration}ms, import: ${importDuration}ms, total: ${totalDuration}ms)`,
    );
    return pluginModule.default;
  } catch (e: any) {
    console.error(`[Plugins] [${id}] CRITICAL: Failed to load after ${Date.now() - start}ms:`, e);
    if (e.code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        `[Plugins] [${id}] This usually means a dependency is missing in the plugin's node_modules.`,
      );
    }
    return null;
  }
};

export const builtInPlugins = async (options: { context: PipelabContext }) => {
  console.log("[Plugins] Starting background plugin loading...");

  // Pre-ensure Node.js and PNPM once in parallel so plugins don't have to wait for them
  sendStartupProgress("Preparing environment...");
  const envStart = Date.now();
  await Promise.all([ensureNodeJS(options.context), ensurePNPM(options.context)]);
  console.log(`[Plugins] Environment preparation took ${Date.now() - envStart}ms`);

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  // Load plugins asynchronously in the background
  (async () => {
    const totalStart = Date.now();
    for (const id of DEFAULT_PLUGIN_IDS) {
      sendStartupProgress(`Loading plugin: ${id}`);
      const pluginStart = Date.now();
      const plugin = await loadPipelabPlugin(id, options);
      console.log(
        `[Plugins] [${id}] loadPipelabPlugin loop step took ${Date.now() - pluginStart}ms`,
      );
      if (plugin) {
        registerPlugins([plugin]);
        webSocketServer.broadcast("plugin:loaded", { plugin });
      }
    }
    console.log(`[Plugins] All default plugins loaded in ${Date.now() - totalStart}ms.`);
    sendStartupProgress("All plugins loaded.");
    setTimeout(() => {
      webSocketServer.broadcast("startup:progress", { type: "ready" });
    }, 2000);
  })();

  return [];
};
