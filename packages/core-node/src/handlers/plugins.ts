import { useAPI } from "../ipc-core";
import type { PipelabContext } from "../context";
// import pacote from "pacote"; // [DISABLED] npm registry lookup — plugin marketplace disabled
// import { rm } from "node:fs/promises"; // [DISABLED] only used by plugin:uninstall body — re-enable with it
import { usePlugins } from "@pipelab/shared";
// import { webSocketServer } from "../websocket-server"; // [DISABLED] only used by plugin:install body — re-enable with it

// [DISABLED] Plugin dynamic loading is disabled. Plugins are statically bundled with the CLI.
// All original handler bodies are preserved below, commented out, for easy re-enable.
// Re-enable: remove the early-return stub blocks and uncomment the original bodies + imports.

export const registerPluginsHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();

  handle("plugin:search", async (_, { send, value }) => {
    // [DISABLED] npm registry search — plugin marketplace disabled.
    // Re-enable: uncomment original below.
    const { query } = value as { query?: string };
    send({
      type: "end",
      data: {
        type: "error",
        ipcError: `Plugin search is disabled in bundled mode (query: "${query || ""}"). All plugins are pre-bundled with the CLI.`,
      },
    });
    return;
    // const query = value.query || "";
    // const text = query ? `${query} keywords:pipelab-plugin` : "keywords:pipelab-plugin";
    // const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=50`;
    // const response = await fetch(url);
    // if (!response.ok) throw new Error(`NPM registry search failed with status ${response.status}`);
    // const data = await response.json();
    // const results = (data.objects || []).map((obj: any) => ({
    //   name: obj.package.name, version: obj.package.version, description: obj.package.description,
    //   keywords: obj.package.keywords, date: obj.package.date,
    // }));
    // send({ type: "end", data: { type: "success", result: { results } } });
  });

  handle("plugin:get-details", async (_, { send, value }) => {
    // [DISABLED] npm packument lookup — plugin marketplace disabled.
    // Re-enable: uncomment original below.
    const { packageName } = value as { packageName: string };
    send({
      type: "end",
      data: {
        type: "error",
        ipcError: `Plugin details lookup is disabled in bundled mode. Package "${packageName}" is either bundled or not available.`,
      },
    });
    return;
    // const { packageName } = value;
    // const packument = await pacote.packument(packageName, { fullMetadata: true });
    // const latestVersion = packument["dist-tags"]?.latest || Object.keys(packument.versions).pop() || "0.0.0";
    // const latestPkg = packument.versions[latestVersion];
    // send({
    //   type: "end",
    //   data: {
    //     type: "success",
    //     result: {
    //       name: packument.name, latestVersion,
    //       versions: Object.keys(packument.versions).reverse(),
    //       description: latestPkg?.description,
    //     },
    //   },
    // });
  });

  handle("plugin:install", async (_, { send, value }) => {
    // [DISABLED] Runtime plugin install — plugins are bundled.
    // Re-enable: uncomment original below + restore the imports at the top.
    const { packageName } = value as { packageName: string };
    send({
      type: "end",
      data: {
        type: "error",
        ipcError: `Plugin installation is disabled in bundled mode. Cannot install "${packageName}" at runtime.`,
      },
    });
    return;
    // const { packageName, version } = value;
    // send({ type: "end", data: { type: "success", result: { result: "ok" } } });
  });

  handle("plugin:uninstall", async (_, { send, value }) => {
    // [DISABLED] Runtime plugin uninstall — plugins are bundled.
    // Re-enable: uncomment original below.
    const { packageName } = value as { packageName: string };
    send({
      type: "end",
      data: {
        type: "error",
        ipcError: `Plugin uninstallation is disabled in bundled mode. Cannot uninstall "${packageName}" at runtime.`,
      },
    });
    return;
    // const { packageName } = value;
    // if (existsSync(targetDir)) await rm(targetDir, { recursive: true, force: true });
    // send({ type: "end", data: { type: "success", result: { result: "ok" } } });
  });

  handle("plugin:list-installed", async (_, { send }) => {
    // [DISABLED] Runtime list of user-installed plugins — no user installs in bundled mode.
    // Re-enable: uncomment original below + restore the findInstalledPlugins import.
    send({
      type: "end",
      data: {
        type: "success",
        result: { installed: [] },
      },
    });
    return;
    // const rawInstalled = await findInstalledPlugins(packagesDir);
    // const { DEFAULT_PLUGIN_IDS, DEV_ONLY_PLUGIN_IDS } = await import("@pipelab/shared");
    // const defaultPluginIds = [...DEFAULT_PLUGIN_IDS];
    // if (isDev) defaultPluginIds.push(...DEV_ONLY_PLUGIN_IDS);
    // const installed = rawInstalled
    //   .filter((item) => !defaultPluginIds.some((id) => item.name === `@pipelab/plugin-${id}`))
    //   .map((item) => ({ name: item.name, version: item.version, description: item.description }));
    // send({ type: "end", data: { type: "success", result: { installed } } });
  });

  // Ensures all required plugin IDs are loaded. Bundled mode: no versions —
  // callers pass a plain plugin-ID list, missing = not in bundle.
  // Called before opening a pipeline in the editor.
  handle("plugin:ensure-loaded", async (_, { send, value }) => {
    const { plugins } = value as { plugins: string[] };
    const { plugins: registeredPlugins } = usePlugins();

    const loaded: string[] = [];
    const failed: string[] = [];

    // [DISABLED] JIT-install missing plugins — plugins are bundled, so missing = not in bundle.
    // Re-enable: accept Record<string, string> again + uncomment the original block below.
    if (Array.isArray(plugins)) {
      for (const pluginId of plugins) {
        if (pluginId && registeredPlugins.value.some((p) => p.id === pluginId)) {
          loaded.push(pluginId);
        } else {
          failed.push(pluginId);
        }
      }
    }

    send({
      type: "end",
      data: {
        type: "success",
        result: { loaded, failed },
      },
    });
    return;
    // const pluginsToEnsure = new Set<string>();
    // if (plugins && typeof plugins === "object") {
    //   for (const id of Object.keys(plugins)) if (id) pluginsToEnsure.add(id);
    // }
    // const { registerPlugins } = usePlugins();
    // for (const packageName of pluginsToEnsure) {
    //   const isRegistered = registeredPlugins.value.some((p) => {
    //     if (p.packageName !== packageName) return false;
    //     if (mappedVersion === "latest") return true;
    //     return p.version === mappedVersion;
    //   });
    //   if (isRegistered) { loaded.push(packageName); continue; }
    //   failed.push(packageName);
    // }
    // send({ type: "end", data: { type: "success", result: { loaded, failed } } });
  });
};
