import { pathToFileURL } from "node:url";
// import { readdir } from "node:fs/promises"; // [DISABLED] only used by findInstalledPlugins scan — re-enable with it
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { PipelabContext } from "./context";
// import { isDev, projectRoot } from "./context"; // [DISABLED] only used by dynamic loader scan — re-enable with it
import { sendStartupProgress } from "./server";

const require = createRequire(import.meta.url);

// [DISABLED] Kept for re-enable of loadPipelabPlugin/loadCustomPlugin above.
// Exported to avoid an unused warning while the dynamic loaders are gated.
export const enhancePluginDefinition = async (
  plugin: any,
  packageDir: string,
  fallbackName: string,
) => {
  if (!plugin) return plugin;

  let packageName = fallbackName;
  let pipelabMeta: any = null;
  let pkgDescription = "";

  try {
    const pkgJsonPath = join(packageDir, "package.json");
    if (existsSync(pkgJsonPath)) {
      const pkgContent = await readFile(pkgJsonPath, "utf8");
      const pkg = JSON.parse(pkgContent);
      if (pkg.name) packageName = pkg.name;
      if (pkg.description) pkgDescription = pkg.description;
      if (pkg.pipelab) pipelabMeta = pkg.pipelab;
    }
  } catch (e) {
    console.error(`[Plugins] Failed to read package.json in ${packageDir}:`, e);
  }

  plugin.packageName = packageName;
  plugin.id = packageName;
  plugin.isOfficial = packageName.startsWith("@pipelab/");

  plugin.name = pipelabMeta?.name || packageName;
  plugin.description = pipelabMeta?.description || pkgDescription || "";

  if (pipelabMeta?.icon) {
    if (typeof pipelabMeta.icon === "string") {
      let iconPath = pipelabMeta.icon;
      if (iconPath.startsWith(".")) {
        iconPath = pathToFileURL(join(packageDir, iconPath)).href;
      }
      plugin.icon = { type: "image", image: iconPath };
    } else {
      plugin.icon = pipelabMeta.icon;
    }
  } else {
    plugin.icon = { type: "icon", icon: "pi pi-box" };
  }

  return plugin;
};

// [DISABLED] Dynamic plugin loading is disabled — plugins are bundled with the CLI.
// Re-enable: uncomment the body below + restore the fetchPipelabPlugin import.
export const loadPipelabPlugin = async (id: string, options: { context: PipelabContext }): Promise<any> => {
  console.warn(`[Plugins] Dynamic plugin loading is disabled in bundled mode. Cannot load "${id}".`);
  return null;
  // const { packageDir, entryPoint } = await fetchPipelabPlugin(id, options.context.releaseTag, { context: options.context, installDeps: false });
  // const pluginModule = await import(pathToFileURL(entryPoint).href);
  // const plugin = pluginModule.default;
  // return await enhancePluginDefinition(plugin, packageDir, id);
};

// [DISABLED] Custom plugin loading is disabled — plugins are bundled with the CLI.
// Re-enable: uncomment the body below + restore the fetchPipelabPlugin import.
export const loadCustomPlugin = async (packageName: string, version: string, options: { context: PipelabContext }): Promise<any> => {
  console.warn(`[Plugins] Custom plugin loading is disabled in bundled mode. Cannot load "${packageName}".`);
  return null;
  // const { packageDir, entryPoint } = await fetchPipelabPlugin(packageName, version, { context: options.context, installDeps: false });
  // const pluginModule = await import(pathToFileURL(entryPoint).href);
  // const plugin = pluginModule.default;
  // return await enhancePluginDefinition(plugin, packageDir, packageName);
};

// [DISABLED] Scanning for user-installed plugins is disabled — no user installs in bundled mode.
// Re-enable: uncomment the body below.
export async function findInstalledPlugins(
  _packagesDir: string,
): Promise<Array<{ name: string; version: string; packageDir: string; description: string }>> {
  return [];
  // Recursively scan packagesDir for package.json files with pipelab plugin keywords.
  // const installed: ... = [];
  // async function scan(dir: string, depth = 0) {
  //   if (depth > 4) return;
  //   const entries = await readdir(dir, { withFileTypes: true });
  //   const hasPkgJson = entries.some((e) => e.isFile() && e.name === "package.json");
  //   if (hasPkgJson) { ... parse pkg.json; if (pipelab || keywords.includes("pipelab-plugin")) installed.push(...) }
  //   for (const entry of entries) if (entry.isDirectory() && entry.name !== "node_modules") await scan(join(dir, entry.name), depth + 1);
  // }
  // await scan(packagesDir);
  // return installed;
}

// All plugins are bundled with the CLI — no dynamic loading.
const BUNDLED_PLUGIN_PACKAGES = [
  "@pipelab/plugin-construct",
  "@pipelab/plugin-filesystem",
  "@pipelab/plugin-system",
  "@pipelab/plugin-electron",
  "@pipelab/plugin-discord",
  "@pipelab/plugin-steam",
  "@pipelab/plugin-itch",
  "@pipelab/plugin-minify",
  "@pipelab/plugin-netlify",
  "@pipelab/plugin-nvpatch",
  "@pipelab/plugin-poki",
  "@pipelab/plugin-tauri",
  "@pipelab/plugin-core",
];

export const builtInPlugins = async (options: { context: PipelabContext }): Promise<void> => {
  console.debug("[Plugins] Starting bundled plugin loading...");

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  webSocketServer.broadcast("startup:progress", { type: "ready" });

  const totalStart = Date.now();

  const loadPromises = BUNDLED_PLUGIN_PACKAGES.map(async (packageName) => {
    sendStartupProgress(`Loading bundled plugin: ${packageName}`);
    const pluginStart = Date.now();
    try {
      const module = await import(packageName);
      const raw = module?.default;
      if (raw) {
        // Raw module defaults carry no id/packageName — without enhancement every
        // plugin registers as id=undefined and overwrites the previous one, leaving
        // a single plugin in the store. Resolve the package dir and enhance, exactly
        // as the dynamic loaders did before bundling.
        let packageDir = "";
        try {
          packageDir = dirname(require.resolve(`${packageName}/package.json`));
        } catch {
          console.warn(`[Plugins] Could not resolve package dir for ${packageName}, using fallbacks`);
        }
        const plugin = await enhancePluginDefinition(raw, packageDir, packageName);
        registerPlugins([plugin]);
        webSocketServer.broadcast("plugin:loaded", { plugin });
        console.debug(`[Plugins] Loaded bundled ${packageName} in ${Date.now() - pluginStart}ms`);
      } else {
        console.warn(`[Plugins] ${packageName} has no default export, skipping`);
      }
    } catch (err) {
      console.error(`[Plugins] Failed to load bundled plugin ${packageName}:`, err);
    }
  });

  await Promise.all(loadPromises);

  console.log(`\n[Plugins] All bundled plugins loaded in ${Date.now() - totalStart}ms.\n`);
  sendStartupProgress("All plugins loaded.");
  setTimeout(() => {
    webSocketServer.broadcast("startup:progress", { type: "done" });
  }, 2000);
};
