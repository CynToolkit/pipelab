import { pathToFileURL } from "node:url";
// import { readdir } from "node:fs/promises"; // [DISABLED] only used by findInstalledPlugins scan — re-enable with it
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { PipelabContext } from "./context";
// import { isDev, projectRoot } from "./context"; // [DISABLED] only used by dynamic loader scan — re-enable with it
import { sendStartupProgress } from "./server";
import constructPlugin from "@pipelab/plugin-construct";
import filesystemPlugin from "@pipelab/plugin-filesystem";
import systemPlugin from "@pipelab/plugin-system";
import electronPlugin from "@pipelab/plugin-electron";
import discordPlugin from "@pipelab/plugin-discord";
import steamPlugin from "@pipelab/plugin-steam";
import itchPlugin from "@pipelab/plugin-itch";
import minifyPlugin from "@pipelab/plugin-minify";
import netlifyPlugin from "@pipelab/plugin-netlify";
import nvpatchPlugin from "@pipelab/plugin-nvpatch";
import pokiPlugin from "@pipelab/plugin-poki";
import tauriPlugin from "@pipelab/plugin-tauri";

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
export const loadPipelabPlugin = async (
  id: string,
  options: { context: PipelabContext },
): Promise<any> => {
  console.warn(
    `[Plugins] Dynamic plugin loading is disabled in bundled mode. Cannot load "${id}".`,
  );
  return null;
  // const { packageDir, entryPoint } = await fetchPipelabPlugin(id, options.context.releaseTag, { context: options.context, installDeps: false });
  // const pluginModule = await import(pathToFileURL(entryPoint).href);
  // const plugin = pluginModule.default;
  // return await enhancePluginDefinition(plugin, packageDir, id);
};

// [DISABLED] Custom plugin loading is disabled — plugins are bundled with the CLI.
// Re-enable: uncomment the body below + restore the fetchPipelabPlugin import.
export const loadCustomPlugin = async (
  packageName: string,
  version: string,
  options: { context: PipelabContext },
): Promise<any> => {
  console.warn(
    `[Plugins] Custom plugin loading is disabled in bundled mode. Cannot load "${packageName}".`,
  );
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

// All plugins are statically imported so app bundles include them and startup never
// resolves a plugin package dynamically. @pipelab/plugin-core is intentionally absent:
// it is a utilities package and has no plugin definition to register.
const getBundledPlugins = () => [
  { packageName: "@pipelab/plugin-construct", plugin: constructPlugin },
  { packageName: "@pipelab/plugin-filesystem", plugin: filesystemPlugin },
  { packageName: "@pipelab/plugin-system", plugin: systemPlugin },
  { packageName: "@pipelab/plugin-electron", plugin: electronPlugin },
  { packageName: "@pipelab/plugin-discord", plugin: discordPlugin },
  { packageName: "@pipelab/plugin-steam", plugin: steamPlugin },
  { packageName: "@pipelab/plugin-itch", plugin: itchPlugin },
  { packageName: "@pipelab/plugin-minify", plugin: minifyPlugin },
  { packageName: "@pipelab/plugin-netlify", plugin: netlifyPlugin },
  { packageName: "@pipelab/plugin-nvpatch", plugin: nvpatchPlugin },
  { packageName: "@pipelab/plugin-poki", plugin: pokiPlugin },
  { packageName: "@pipelab/plugin-tauri", plugin: tauriPlugin },
];

export const builtInPlugins = async (options: { context: PipelabContext }): Promise<void> => {
  console.debug("[Plugins] Starting bundled plugin loading...");
  const bundledPlugins = getBundledPlugins();

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  webSocketServer.broadcast("startup:progress", { type: "ready" });

  const totalStart = Date.now();

  const loadPromises = bundledPlugins.map(async ({ packageName, plugin: raw }) => {
    sendStartupProgress(`Loading bundled plugin: ${packageName}`);
    const pluginStart = Date.now();
    try {
      if (raw) {
        // Raw module defaults carry no id/packageName — without enhancement every
        // plugin registers as id=undefined and overwrites the previous one, leaving
        // a single plugin in the store. Resolve the package dir and enhance, exactly
        // as the dynamic loaders did before bundling.
        let packageDir = "";
        try {
          packageDir = dirname(require.resolve(`${packageName}/package.json`));
        } catch {
          console.warn(
            `[Plugins] Could not resolve package dir for ${packageName}, using fallbacks`,
          );
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
