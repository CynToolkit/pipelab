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
  staticMetadata?: { name?: string; description?: string; icon?: any },
) => {
  if (!plugin) return plugin;

  let packageName = fallbackName;
  let pipelabMeta: any = staticMetadata || null;
  let pkgDescription = staticMetadata?.description || "";

  try {
    const pkgJsonPath = packageDir ? join(packageDir, "package.json") : "";
    if (pkgJsonPath && existsSync(pkgJsonPath)) {
      const pkgContent = await readFile(pkgJsonPath, "utf8");
      const pkg = JSON.parse(pkgContent);
      if (pkg.name) packageName = pkg.name;
      if (pkg.description) pkgDescription = pkg.description;
      if (pkg.pipelab) pipelabMeta = { ...pipelabMeta, ...pkg.pipelab };
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
      if (iconPath.startsWith(".") && packageDir) {
        iconPath = pathToFileURL(join(packageDir, iconPath)).href;
      }
      plugin.icon = packageDir
        ? { type: "image", image: iconPath }
        : { type: "icon", icon: "pi pi-box" };
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
  {
    packageName: "@pipelab/plugin-construct",
    plugin: constructPlugin,
    metadata: { name: "Construct", description: "Pipelab plugin for exporting and packaging Construct 3 projects", icon: "./dist/assets/construct.webp" },
  },
  {
    packageName: "@pipelab/plugin-filesystem",
    plugin: filesystemPlugin,
    metadata: { name: "Filesystem", description: "Pipelab plugin for filesystem operations (copy, move, delete, zip)", icon: { type: "icon", icon: "mdi-folder-zip-outline" } },
  },
  {
    packageName: "@pipelab/plugin-system",
    plugin: systemPlugin,
    metadata: { name: "System", description: "Pipelab plugin for running shell commands and system operations", icon: { type: "icon", icon: "mdi-cog-outline" } },
  },
  {
    packageName: "@pipelab/plugin-electron",
    plugin: electronPlugin,
    metadata: { name: "Electron", description: "Pipelab plugin for packaging apps with Electron", icon: "./dist/public/electron.webp" },
  },
  {
    packageName: "@pipelab/plugin-discord",
    plugin: discordPlugin,
    metadata: { name: "Discord", description: "Pipelab plugin for Discord Rich Presence and notifications", icon: "./dist/public/discord.webp" },
  },
  {
    packageName: "@pipelab/plugin-steam",
    plugin: steamPlugin,
    metadata: { name: "Steam", description: "Pipelab plugin for publishing games to Steam via SteamCMD", icon: "./dist/steam.webp" },
  },
  {
    packageName: "@pipelab/plugin-itch",
    plugin: itchPlugin,
    metadata: { name: "Itch.io", description: "Pipelab plugin for publishing games to itch.io", icon: "./dist/assets/itch-icon.webp" },
  },
  {
    packageName: "@pipelab/plugin-minify",
    plugin: minifyPlugin,
    metadata: { name: "Minifyer", description: "Pipelab plugin for minifying HTML, CSS, and JavaScript assets", icon: { type: "icon", icon: "mdi-zip-box" } },
  },
  {
    packageName: "@pipelab/plugin-netlify",
    plugin: netlifyPlugin,
    metadata: { name: "Netlify", description: "Pipelab plugin for deploying web projects to Netlify", icon: "./dist/assets/netlify-icon.webp" },
  },
  {
    packageName: "@pipelab/plugin-nvpatch",
    plugin: nvpatchPlugin,
    metadata: { name: "NVPatch", description: "Pipelab plugin for patching NW.js game exports", icon: { type: "icon", icon: "mdi-wrench" } },
  },
  {
    packageName: "@pipelab/plugin-poki",
    plugin: pokiPlugin,
    metadata: { name: "Poki", description: "Pipelab plugin for publishing HTML5 games to Poki", icon: "./dist/assets/poki-icon.webp" },
  },
  {
    packageName: "@pipelab/plugin-tauri",
    plugin: tauriPlugin,
    metadata: { name: "Tauri", description: "Pipelab plugin for packaging apps with Tauri", icon: "./dist/public/tauri.webp" },
  },
];

export const builtInPlugins = async (options: { context: PipelabContext }): Promise<void> => {
  console.debug("[Plugins] Starting bundled plugin loading...");

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  webSocketServer.broadcast("startup:progress", { type: "ready" });

  const totalStart = Date.now();

  const loadPromises = BUNDLED_PLUGINS.map(async ({ packageName, plugin: raw, metadata }) => {
    sendStartupProgress(`Loading bundled plugin: ${packageName}`);
    const pluginStart = Date.now();
    try {
      if (raw) {
        // Raw module defaults carry no id/packageName — without enhancement every
        // plugin registers as id=undefined and overwrites the previous one, leaving
        // a single plugin in the store. Static metadata is used in production;
        // package metadata is only enriched during development.
        let packageDir = "";
        if (process.env.NODE_ENV !== "production") {
          try {
            packageDir = dirname(require.resolve(packageName));
            while (
              packageDir !== dirname(packageDir) &&
              !existsSync(join(packageDir, "package.json"))
            ) {
              packageDir = dirname(packageDir);
            }
          } catch {
            // Development package metadata is optional; static metadata remains available.
          }
        }
        const plugin = await enhancePluginDefinition(raw, packageDir, packageName, metadata);
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
