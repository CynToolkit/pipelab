import { useAPI } from "../ipc-core";
import { PipelabContext, isDev, projectRoot } from "../context";
import pacote from "pacote";
import { rm } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { usePlugins } from "@pipelab/shared";
import { webSocketServer } from "../websocket-server";
import { fetchPipelabPlugin } from "../utils/remote";
import { loadCustomPlugin, findInstalledPlugins } from "../plugins-registry";

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

export const registerPluginsHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();

  handle("plugin:search", async (_, { send, value }) => {
    try {
      const query = value.query || "";
      const text = query ? `${query} keywords:pipelab-plugin` : "keywords:pipelab-plugin";
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=50`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NPM registry search failed with status ${response.status}`);
      }

      const data = await response.json();
      const results = (data.objects || []).map((obj: any) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description,
        keywords: obj.package.keywords,
        date: obj.package.date,
      }));

      send({
        type: "end",
        data: {
          type: "success",
          result: { results },
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message || "Failed to search npm registry",
        },
      });
    }
  });

  handle("plugin:get-details", async (_, { send, value }) => {
    try {
      const { packageName } = value;
      const packument = await pacote.packument(packageName, { fullMetadata: true });
      const latestVersion =
        packument["dist-tags"]?.latest || Object.keys(packument.versions).pop() || "0.0.0";
      const latestPkg = packument.versions[latestVersion];

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            name: packument.name,
            latestVersion,
            versions: Object.keys(packument.versions).reverse(),
            description: latestPkg?.description,
          },
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message || "Failed to get plugin details",
        },
      });
    }
  });

  handle("plugin:install", async (_, { send, value }) => {
    try {
      const { packageName, version } = value;
      const mappedVersion = resolvePluginVersion(packageName, version);
      console.log(`[Plugins] Installing ${packageName}@${mappedVersion}...`);

      const { packageDir } = await fetchPipelabPlugin(packageName, mappedVersion, {
        context,
        installDeps: false,
      });

      const plugin = await loadCustomPlugin(packageName, mappedVersion, { context });
      if (!plugin) {
        throw new Error("Failed to load installed plugin module.");
      }

      const { registerPlugins } = usePlugins();
      registerPlugins([plugin]);

      webSocketServer.broadcast("plugin:loaded", { plugin });

      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (e: any) {
      console.error(`[Plugins] Installation failed for ${value.packageName}:`, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message || "Failed to install plugin",
        },
      });
    }
  });

  handle("plugin:uninstall", async (_, { send, value }) => {
    try {
      const { packageName } = value;
      console.log(`[Plugins] Uninstalling plugin ${packageName}...`);
      const targetDir = context.getPackagesPath(packageName);

      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }

      send({
        type: "end",
        data: {
          type: "success",
          result: { result: "ok" },
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message || "Failed to uninstall plugin",
        },
      });
    }
  });

  handle("plugin:list-installed", async (_, { send }) => {
    try {
      const packagesDir = context.getPackagesPath();
      const rawInstalled = await findInstalledPlugins(packagesDir);

      const { DEFAULT_PLUGIN_IDS, DEV_ONLY_PLUGIN_IDS } = await import("@pipelab/shared");
      const defaultPluginIds = [...DEFAULT_PLUGIN_IDS];

      if (isDev) {
        defaultPluginIds.push(...DEV_ONLY_PLUGIN_IDS);
      }

      const installed = rawInstalled
        .filter((item) => {
          const isDefault = defaultPluginIds.some((id) => item.name === `@pipelab/plugin-${id}`);
          return !isDefault;
        })
        .map((item) => ({
          name: item.name,
          version: item.version,
          description: item.description,
        }));

      send({
        type: "end",
        data: {
          type: "success",
          result: { installed },
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message || "Failed to list installed plugins",
        },
      });
    }
  });

  // Ensures all required plugin IDs are loaded, JIT-installing any that are missing.
  // Called before opening a pipeline in the editor.
  handle("plugin:ensure-loaded", async (_, { send, value }) => {
    const { plugins } = value;
    const { plugins: registeredPlugins, registerPlugins } = usePlugins();
    const loaded: string[] = [];
    const failed: string[] = [];

    const pluginsToEnsure = new Set<string>();
    if (plugins && typeof plugins === "object") {
      for (const id of Object.keys(plugins)) {
        if (id) pluginsToEnsure.add(id);
      }
    }

    for (const packageName of pluginsToEnsure) {
      const mappedVersion = resolvePluginVersion(packageName);

      const isRegistered = registeredPlugins.value.some((p) => {
        if (p.packageName !== packageName) return false;
        if (mappedVersion === "latest") return true;
        return p.version === mappedVersion;
      });

      if (isRegistered) {
        loaded.push(packageName);
        continue;
      }

      console.warn(`[Plugins] Plugin "${packageName}" is required but not loaded at startup.`);
      failed.push(packageName);
    }

    send({
      type: "end",
      data: {
        type: "success",
        result: { loaded, failed },
      },
    });
  });
};
