import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { PipelabContext } from "./context";
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

// All plugins are statically imported so app bundles include them and startup never
// resolves a plugin package dynamically. @pipelab/plugin-core is intentionally absent:
// it is a utilities package and has no plugin definition to register.
const BUNDLED_PLUGINS = [
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

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  webSocketServer.broadcast("startup:progress", { type: "ready" });

  const totalStart = Date.now();

  const loadPromises = BUNDLED_PLUGINS.map(async ({ packageName, plugin: raw }) => {
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
