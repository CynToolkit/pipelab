import { useAPI } from "../ipc-core";
import { PipelabContext, isDev, projectRoot } from "../context";
// import pacote from "pacote"; // [DISABLED] npm registry lookup — plugin marketplace disabled
// import { rm } from "node:fs/promises"; // [DISABLED] only used by plugin:uninstall body — re-enable with it
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { usePlugins } from "@pipelab/shared";
// import { webSocketServer } from "../websocket-server"; // [DISABLED] only used by plugin:install body — re-enable with it
// import { fetchPipelabPlugin } from "../utils/remote"; // [DISABLED] dynamic plugin fetch
// import { loadCustomPlugin, findInstalledPlugins } from "../plugins-registry"; // [DISABLED] dynamic load

// [DISABLED] Plugin dynamic loading is disabled. Plugins are statically bundled with the CLI.
// All original handler bodies are preserved below, commented out, for easy re-enable.
// Re-enable: remove the early-return stub blocks and uncomment the original bodies + imports.

// Maps workspace plugin package names (e.g. "@pipelab/plugin-steam") to their physical directory paths.
// This is populated at startup in dev mode, supporting plugin folders whose directory names
// differ from their actual package.json name.
const localPluginsMap = new Map<string, string>();

if (isDev && projectRoot) {
  const pluginsDir = join(projectRoot, "plugins");
  if (existsSync(pluginsDir)) {
    try {
      const entries = readdirSync(pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = join(pluginsDir, entry.name, "package.json");
          if (existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
              if (pkg.name) {
                localPluginsMap.set(pkg.name, join(pluginsDir, entry.name));
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

/**
 * Resolves a requested plugin version.
 * If the plugin is present in the local workspace map during development,
 * its version is overridden to "local" so Pipelab loads it from the source files.
 */
export function resolvePluginVersion(packageName: string, requestedVersion?: string): string {
  if (
    isDev &&
    projectRoot &&
    process.env.PIPELAB_FORCE_NPM !== "true" &&
    localPluginsMap.has(packageName)
  ) {
    return "local";
  }
  return requestedVersion || "latest";
}

// Note: `context` is unused while the install/uninstall bodies below are commented out.
// Signatures are intentionally left unchanged so re-enable = delete guard + uncomment body.
export const registerPluginsHandlers = (context: PipelabContext) => {
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
    // const mappedVersion = resolvePluginVersion(packageName, version);
    // const { packageDir } = await fetchPipelabPlugin(packageName, mappedVersion, { context, installDeps: false });
    // const plugin = await loadCustomPlugin(packageName, mappedVersion, { context });
    // if (!plugin) throw new Error("Failed to load installed plugin module.");
    // const { registerPlugins } = usePlugins();
    // registerPlugins([plugin]);
    // webSocketServer.broadcast("plugin:loaded", { plugin });
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
    // const targetDir = context.getPackagesPath(packageName);
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
    // const packagesDir = context.getPackagesPath();
    // const rawInstalled = await findInstalledPlugins(packagesDir);
    // const { DEFAULT_PLUGIN_IDS, DEV_ONLY_PLUGIN_IDS } = await import("@pipelab/shared");
    // const defaultPluginIds = [...DEFAULT_PLUGIN_IDS];
    // if (isDev) defaultPluginIds.push(...DEV_ONLY_PLUGIN_IDS);
    // const installed = rawInstalled
    //   .filter((item) => !defaultPluginIds.some((id) => item.name === `@pipelab/plugin-${id}`))
    //   .map((item) => ({ name: item.name, version: item.version, description: item.description }));
    // send({ type: "end", data: { type: "success", result: { installed } } });
  });

  // Ensures all required plugin IDs are loaded, JIT-installing any that are missing.
  // Called before opening a pipeline in the editor.
  handle("plugin:ensure-loaded", async (_, { send, value }) => {
    const { plugins } = value as { plugins: Record<string, unknown> };
    const { plugins: registeredPlugins } = usePlugins();

    const loaded: string[] = [];
    const failed: string[] = [];

    // [DISABLED] JIT-install missing plugins — plugins are bundled, so missing = not in bundle.
    // Re-enable: uncomment the original "for (... resolvePluginVersion ...)" block below.
    if (plugins && typeof plugins === "object") {
      for (const pluginId of Object.keys(plugins)) {
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
    //   const mappedVersion = resolvePluginVersion(packageName);
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
