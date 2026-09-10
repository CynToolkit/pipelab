import { PipelabContext } from "./context";
import { sendStartupProgress } from "./server";
import type { RendererPluginDefinition } from "@pipelab/shared";
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

// Built-in plugin definitions are statically imported into the CLI. Their identities
// live with the plugin sources, so startup never reads package metadata or resolves
// a package directory.
export const bundledPlugins: RendererPluginDefinition[] = [
  constructPlugin,
  filesystemPlugin,
  systemPlugin,
  electronPlugin,
  discordPlugin,
  steamPlugin,
  itchPlugin,
  minifyPlugin,
  netlifyPlugin,
  nvpatchPlugin,
  pokiPlugin,
  tauriPlugin,
];

export const builtInPlugins = async (_options: { context: PipelabContext }): Promise<void> => {
  console.debug("[Plugins] Starting bundled plugin loading...");

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  webSocketServer.broadcast("startup:progress", { type: "ready" });

  const totalStart = Date.now();

  await Promise.all(
    bundledPlugins.map(async (plugin) => {
      sendStartupProgress(`Loading bundled plugin: ${plugin.packageName}`);
      const pluginStart = Date.now();
      try {
        registerPlugins([plugin]);
        webSocketServer.broadcast("plugin:loaded", { plugin });
        console.debug(
          `[Plugins] Loaded bundled ${plugin.packageName} in ${Date.now() - pluginStart}ms`,
        );
      } catch (err) {
        console.error(`[Plugins] Failed to load bundled ${plugin.packageName}:`, err);
      }
    }),
  );

  console.log(`\n[Plugins] All bundled plugins loaded in ${Date.now() - totalStart}ms.\n`);
  sendStartupProgress("All plugins loaded.");
  setTimeout(() => {
    webSocketServer.broadcast("startup:progress", { type: "done" });
  }, 2000);
};
