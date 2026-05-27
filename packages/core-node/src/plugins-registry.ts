import { ensureNodeJS, ensurePNPM, fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PipelabContext, isDev, projectRoot } from "./context";
import { sendStartupProgress } from "./server";

const enhancePluginDefinition = async (
  plugin: any,
  packageDir: string,
  fallbackName: string,
  fallbackVersion: string,
) => {
  if (!plugin) return plugin;

  let packageName = fallbackName;
  let version = fallbackVersion;
  let pipelabMeta: any = null;
  let pkgDescription = "";

  try {
    const pkgJsonPath = join(packageDir, "package.json");
    if (existsSync(pkgJsonPath)) {
      const pkgContent = await readFile(pkgJsonPath, "utf8");
      const pkg = JSON.parse(pkgContent);
      if (pkg.name) packageName = pkg.name;
      if (pkg.version) version = pkg.version;
      if (pkg.description) pkgDescription = pkg.description;
      if (pkg.pipelab) pipelabMeta = pkg.pipelab;
    }
  } catch (e) {
    console.error(`[Plugins] Failed to read package.json in ${packageDir}:`, e);
  }

  plugin.packageName = packageName;
  plugin.id = packageName;
  plugin.version = fallbackVersion === "local" ? "local" : version;
  plugin.isOfficial = packageName.startsWith("@pipelab/");

  // Dynamically resolve name, description, and icon from package.json
  plugin.name = pipelabMeta?.name || packageName;
  plugin.description = pipelabMeta?.description || pkgDescription || "";

  if (pipelabMeta?.icon) {
    if (typeof pipelabMeta.icon === "string") {
      let iconPath = pipelabMeta.icon;
      if (iconPath.startsWith(".")) {
        iconPath = pathToFileURL(join(packageDir, iconPath)).href;
      }
      plugin.icon = {
        type: "image",
        image: iconPath,
      };
    } else {
      plugin.icon = pipelabMeta.icon;
    }
  } else {
    plugin.icon = {
      type: "icon",
      icon: "pi pi-box",
    };
  }

  return plugin;
};

export const loadPipelabPlugin = async (id: string, options: { context: PipelabContext }) => {
  const start = Date.now();
  try {
    const packageName = id;
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

    const plugin = pluginModule.default;
    await enhancePluginDefinition(plugin, packageDir, packageName, options.context.releaseTag);
    return plugin;
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

export const loadCustomPlugin = async (
  packageName: string,
  version: string,
  options: { context: PipelabContext },
) => {
  const start = Date.now();
  try {
    const fetchStart = Date.now();
    const { packageDir, entryPoint } = await fetchPipelabPlugin(packageName, version, {
      context: options.context,
      installDeps: false,
    });
    const fetchDuration = Date.now() - fetchStart;

    console.log(
      `[Plugins] [${packageName}] Attempting to import custom plugin from: ${entryPoint}`,
    );
    if (!existsSync(entryPoint)) {
      console.error(
        `[Plugins] [${packageName}] CRITICAL: Plugin entry point not found at ${entryPoint}`,
      );
      return null;
    }

    const importStart = Date.now();
    const pluginModule = await import(pathToFileURL(entryPoint).href);
    const importDuration = Date.now() - importStart;
    const totalDuration = Date.now() - start;
    console.log(
      `[Plugins] [${packageName}] Successfully loaded custom plugin from: ${packageDir} (fetch: ${fetchDuration}ms, import: ${importDuration}ms, total: ${totalDuration}ms)`,
    );

    const plugin = pluginModule.default;
    await enhancePluginDefinition(plugin, packageDir, packageName, version);
    return plugin;
  } catch (e: any) {
    console.error(
      `[Plugins] [${packageName}] CRITICAL: Failed to load after ${Date.now() - start}ms:`,
      e,
    );
    return null;
  }
};

export async function findInstalledPlugins(
  packagesDir: string,
): Promise<Array<{ name: string; version: string; packageDir: string; description: string }>> {
  const installed: Array<{
    name: string;
    version: string;
    packageDir: string;
    description: string;
  }> = [];
  if (!existsSync(packagesDir)) return installed;

  async function scan(dir: string, depth = 0) {
    if (depth > 4) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const hasPkgJson = entries.some((e) => e.isFile() && e.name === "package.json");
      if (hasPkgJson) {
        try {
          const content = await readFile(join(dir, "package.json"), "utf8");
          const pkg = JSON.parse(content);
          if (pkg.name && pkg.name !== "pnpm") {
            installed.push({
              name: pkg.name,
              version: pkg.version || "0.0.0",
              packageDir: dir,
              description: pkg.description || "",
            });
          }
        } catch (e) {
          // ignore invalid package.json
        }
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          await scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch (e) {
      // ignore errors
    }
  }

  await scan(packagesDir);
  return installed;
}

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
    const pluginsToLoad = new Map<string, string>(); // packageName -> version

    // Load default/native plugins by default
    const defaultPlugins = [
      "@pipelab/plugin-construct",
      "@pipelab/plugin-filesystem",
      "@pipelab/plugin-system",
      "@pipelab/plugin-steam",
      "@pipelab/plugin-itch",
      "@pipelab/plugin-electron",
      "@pipelab/plugin-discord",
      "@pipelab/plugin-poki",
      "@pipelab/plugin-nvpatch",
      "@pipelab/plugin-tauri",
      "@pipelab/plugin-minify",
      "@pipelab/plugin-netlify",
    ];
    for (const name of defaultPlugins) {
      pluginsToLoad.set(name, "latest");
    }

    if (isDev && projectRoot) {
      const pluginsDir = join(projectRoot, "plugins");
      if (existsSync(pluginsDir)) {
        try {
          const entries = await readdir(pluginsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgPath = join(pluginsDir, entry.name, "package.json");
              if (existsSync(pkgPath)) {
                try {
                  const pkgContent = await readFile(pkgPath, "utf-8");
                  const pkg = JSON.parse(pkgContent);
                  if (
                    pkg.name &&
                    pkg.name.startsWith("@pipelab/plugin-") &&
                    pkg.name !== "@pipelab/plugin-core"
                  ) {
                    pluginsToLoad.set(pkg.name, "local");
                  }
                } catch (e) {
                  console.error(`[Plugins] Failed to parse package.json for ${entry.name}:`, e);
                }
              }
            }
          }
        } catch (e) {
          console.error(`[Plugins] Failed to scan local workspace plugins directory:`, e);
        }
      }
    }

    try {
      const { setupConfigFile } = await import("./config");
      const settingsManager = await setupConfigFile<any>("settings", { context: options.context });
      const settingsConfig = await settingsManager.getConfig();
      const settingsPlugins = settingsConfig?.plugins || [];

      for (const plugin of settingsPlugins) {
        if (plugin.name) {
          if (plugin.enabled) {
            if (!pluginsToLoad.has(plugin.name)) {
              pluginsToLoad.set(plugin.name, "latest");
            }
          } else {
            // If explicitly disabled in settings, remove it from the loading list
            pluginsToLoad.delete(plugin.name);
          }
        }
      }
    } catch (e) {
      console.error(`[Plugins] Failed to load settings config on startup:`, e);
    }

    console.log(`[Plugins] Total plugins to load on startup:`, Array.from(pluginsToLoad.entries()));

    // Now load all collected plugins
    for (const [packageName, version] of pluginsToLoad.entries()) {
      sendStartupProgress(`Loading plugin: ${packageName}`);
      const pluginStart = Date.now();
      try {
        const plugin = await loadCustomPlugin(packageName, version, options);
        if (plugin) {
          registerPlugins([plugin]);
          webSocketServer.broadcast("plugin:loaded", { plugin });
          console.log(
            `[Plugins] Loaded ${packageName}@${version} in ${Date.now() - pluginStart}ms`,
          );
        }
      } catch (err) {
        console.error(`[Plugins] Failed to load plugin ${packageName} at startup:`, err);
      }
    }

    console.log(`[Plugins] All startup plugins loaded in ${Date.now() - totalStart}ms.`);
    sendStartupProgress("All plugins loaded.");
    setTimeout(() => {
      webSocketServer.broadcast("startup:progress", { type: "ready" });
    }, 2000);
  })();

  return [];
};
