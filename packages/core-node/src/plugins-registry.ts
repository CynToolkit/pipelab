import { PipelabContext } from "./context";
import { sendStartupProgress } from "./server";
import { toRendererPluginMetadata } from "./utils";
import { builtInProviders } from "./providers-registry";

// Built-in plugin definitions are statically imported into the CLI. Their identities
// live with the plugin sources, so startup never reads package metadata or resolves
// a package directory.
export const bundledPlugins = builtInProviders;

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
        const metadata = toRendererPluginMetadata(plugin);
        registerPlugins([metadata]);
        webSocketServer.broadcast("plugin:loaded", {
          plugin: metadata,
        });
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
