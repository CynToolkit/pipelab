import { app, shell, BrowserWindow, dialog, autoUpdater, screen, protocol, net } from "electron";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { platform } from "node:os";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { startServer, stopServer } from "./main/server-process";
import { websocketPort, uiDevPort, getProtocolName, getAppBundleId } from "@pipelab/constants";
import { registerIpcHandlers } from "./main/ipc-handlers";
import { getDefaultUserDataPath, fetchLatestDesktopRelease } from "@pipelab/core-node";
import started from "electron-squirrel-startup";
import { PostHog } from "posthog-node";
import { parseArgs } from "node:util";
import semver from "semver";

const isProduction = app.isPackaged && process.env.TEST !== "true";

let posthog: PostHog | undefined;
if (isProduction) {
  posthog = new PostHog(process.env.POSTHOG_API_KEY || "", {
    host: "https://eu.i.posthog.com",
  });
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception in Main Process:", error);
  if (posthog) {
    posthog.capture({
      distinctId: "desktop-main-process",
      event: "uncaught_exception",
      properties: {
        message: error.message,
        stack: error.stack,
        platform: process.platform,
        version: app.getVersion(),
      },
    });
  }
});

const getEnv = () => {
  if (is.dev) return "dev";
  if (app.getVersion().includes("beta")) return "beta";
  return "prod";
};

const customUserDataPath = getDefaultUserDataPath(getEnv());
app.setPath("userData", join(customUserDataPath, "desktop"));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function getIconPath() {
  let ext = ".png";
  if (platform() === "win32") ext = ".ico";
  else if (platform() === "darwin") ext = ".icns";
  return join("./assets", "build", `icon${ext}`);
}

let pendingUrl: string | null = null;

function findProtocolUrl(args: string[], values: any, positionals: string[]): string | null {
  const pUrl = positionals.find(
    (arg) => arg.startsWith("pipelab://") || arg.startsWith("pipelab-beta://"),
  );
  if (pUrl) return pUrl;

  const startArgs = values["process-start-args"];
  if (typeof startArgs === "string" && startArgs) {
    if (startArgs.startsWith("pipelab://") || startArgs.startsWith("pipelab-beta://")) {
      return startArgs;
    }
    const parts = startArgs.split(/\s+/);
    const partUrl = parts.find(
      (arg) => arg.startsWith("pipelab://") || arg.startsWith("pipelab-beta://"),
    );
    if (partUrl) return partUrl;
  }

  const anyUrl = args.find(
    (arg) => arg.startsWith("pipelab://") || arg.startsWith("pipelab-beta://"),
  );
  if (anyUrl) return anyUrl;

  return null;
}

function handleProtocolUrl(url: string) {
  if (!url) return;
  console.info(`[Main] Handling protocol URL: ${url}`);
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("protocol-url", url);
  } else {
    pendingUrl = url;
  }
}

// Register macOS open-url handler
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Single Instance Lock setup
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.info("[Main] Another instance is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", (event, commandLine) => {
    console.info(`[Main] Second instance started with command line: ${commandLine.join(" ")}`);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    try {
      const config = {
        options: {
          "process-start-args": { type: "string" as const },
        },
        strict: false,
      };
      const { values, positionals } = parseArgs({
        ...config,
        args: commandLine.slice(1),
      });

      const url = findProtocolUrl(commandLine, values, positionals);
      if (url) {
        handleProtocolUrl(url);
      }
    } catch (err) {
      console.error("[Main] Failed to parse second-instance arguments:", err);
    }
  });
}

if (process.platform === "win32" && process.env.TEST !== "true" && app.isPackaged) {
  if (started) {
    app.quit();
  }
}

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  const position =
    externalDisplay && is.dev
      ? {
          x: externalDisplay.bounds.x + 50,
          y: externalDisplay.bounds.y + 50,
        }
      : {};

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    icon: getIconPath(),
    autoHideMenuBar: true,
    ...position,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: false,
      devTools: is.dev,
      additionalArguments: [`--app-version=${app.getVersion()}`],
    },
  });

  if (is.dev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingUrl) {
      mainWindow?.webContents.send("protocol-url", pendingUrl);
      pendingUrl = null;
    }
  });

  mainWindow.on("close", function () {
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
}

const protocolName = getProtocolName(app.getVersion());

if (is.dev && process.platform === "win32") {
  app.setAsDefaultProtocolClient(protocolName, process.execPath, [resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(protocolName);
}

const sendUpdateStatus = (status: string, downloadUrl?: string, version?: string) => {
  mainWindow?.webContents.send("update:set-status", {
    data: { status, downloadUrl, version },
    requestId: "shell-update",
  });
};

app.whenReady().then(async () => {
  protocol.handle("media", (request) => {
    const path = decodeURIComponent(request.url.replace(/^media:\/\/+/, "/"));
    return net.fetch(pathToFileURL(path).toString());
  });

  // Check if launched via protocol URL on startup
  const startupArgs = is.dev ? process.argv.slice(2) : process.argv.slice(1);
  try {
    const config = {
      options: {
        "process-start-args": { type: "string" as const },
      },
      strict: false,
    };
    const { values, positionals } = parseArgs({
      ...config,
      args: startupArgs,
    });
    const url = findProtocolUrl(process.argv, values, positionals);
    if (url) {
      handleProtocolUrl(url);
    }
  } catch (err) {
    console.error("[Main] Failed to parse startup protocol URL:", err);
  }

  const supportsAutoUpdate = process.platform === "win32" || process.platform === "darwin";

  if (
    !is.dev ||
    process.env.APP_UPDATE_URL ||
    process.env.PIPELAB_OVERRIDE_RELEASE ||
    process.env.FORCE_UPDATE_CHECK === "true"
  ) {
    console.log("[Update] --- Auto-Updater Debug Info ---");
    console.log(`[Update] Platform: ${process.platform}`);
    console.log(`[Update] Arch: ${process.arch}`);
    console.log(`[Update] Current Version: ${app.getVersion()}`);
    console.log(`[Update] Is Packaged: ${app.isPackaged}`);
    console.log(`[Update] FORCE_UPDATE_CHECK: ${process.env.FORCE_UPDATE_CHECK}`);
    console.log(`[Update] Supports Auto-Update: ${supportsAutoUpdate}`);

    let updateUrl =
      process.env.APP_UPDATE_URL ||
      "https://github.com/CynToolkit/pipelab/releases/latest/download";

    let latestRelease: any = null;

    // 1. Try to resolve the latest desktop-specific release from GitHub
    if (!process.env.APP_UPDATE_URL) {
      const currentVersion = app.getVersion();
      const isPrerelease = currentVersion.includes("-") || process.env.PRERELEASE === "true";

      console.log(
        `[Update] Fetching ${isPrerelease ? "beta" : "stable"} releases from GitHub API...`,
      );

      const release = await fetchLatestDesktopRelease({ allowPrerelease: isPrerelease });
      if (release) {
        latestRelease = release;
        updateUrl = `https://github.com/CynToolkit/pipelab/releases/download/${release.tag_name}`;
        console.log(`[Update] Target Tag: ${release.tag_name}`);
        console.log(`[Update] Release API URL: ${release.html_url}`);
      } else {
        console.warn("[Update] No desktop release found, using fallback URL");
      }
    }

    // Helper to resolve manual download details for the platform
    const resolveManualDownloadUrl = (
      release: any,
    ): { downloadUrl: string; version: string } | null => {
      if (!release) return null;
      const latestVersion = release.tag_name.split("@").pop();
      if (!latestVersion) return null;

      let asset;
      if (process.platform === "linux") {
        asset =
          release.assets?.find((a: any) => a.name.endsWith(".AppImage")) ||
          release.assets?.find((a: any) => a.name.endsWith(".deb"));
      } else if (process.platform === "darwin") {
        asset =
          release.assets?.find((a: any) => a.name.endsWith(".dmg")) ||
          release.assets?.find((a: any) => a.name.endsWith(".zip"));
      } else if (process.platform === "win32") {
        asset = release.assets?.find((a: any) => a.name.endsWith(".exe"));
      }

      return {
        downloadUrl: asset ? asset.browser_download_url : release.html_url,
        version: latestVersion,
      };
    };

    if (supportsAutoUpdate) {
      console.log(`[Update] Final Feed URL: ${updateUrl}`);
      if (process.platform === "win32") {
        console.log(`[Update] (Windows) Squirrel will request: ${updateUrl}/RELEASES`);
      }

      try {
        autoUpdater.setFeedURL({
          url: updateUrl,
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        autoUpdater.on("checking-for-update", () => {
          console.log("[Update] Checking for update...");
          sendUpdateStatus("checking-for-update");
        });
        autoUpdater.on("update-available", () => {
          console.log("[Update] Update available!");
          sendUpdateStatus("update-available");
        });
        autoUpdater.on("update-not-available", () => {
          console.log("[Update] Update not available.");
          sendUpdateStatus("update-not-available");
        });

        autoUpdater.on("update-downloaded", (event, releaseNotes, releaseName) => {
          console.log("[Update] Update downloaded:", releaseName);
          sendUpdateStatus("update-downloaded");

          const dialogOpts: Electron.MessageBoxOptions = {
            type: "info",
            buttons: ["Restart", "Later"],
            title: "Application Update",
            message: process.platform === "win32" ? releaseNotes : releaseName,
            detail:
              "A new version has been downloaded. Restart the application to apply the updates.",
          };

          dialog.showMessageBox(dialogOpts).then((returnValue) => {
            if (returnValue.response === 0) autoUpdater.quitAndInstall();
          });
        });

        autoUpdater.on("error", (message) => {
          console.error("[Update] AutoUpdater encountered an error:", message);
          // Fallback to manual update indicator if an update is actually available
          const manualInfo = resolveManualDownloadUrl(latestRelease);
          const currentVersion = app.getVersion();
          if (
            manualInfo &&
            semver.valid(manualInfo.version) &&
            semver.gt(manualInfo.version, currentVersion)
          ) {
            console.log(
              `[Update] AutoUpdater failed, falling back to manual update for v${manualInfo.version}`,
            );
            sendUpdateStatus("update-available", manualInfo.downloadUrl, manualInfo.version);
          } else {
            sendUpdateStatus("error");
          }
        });
      } catch (err) {
        console.error("[Update] Failed to setup autoUpdater:", err);
      }
    } else {
      // Manual update check path for Linux and other unsupported platforms
      console.log("[Update] Auto-updater is not supported. Running manual check...");
      const manualInfo = resolveManualDownloadUrl(latestRelease);
      const currentVersion = app.getVersion();
      if (
        manualInfo &&
        semver.valid(manualInfo.version) &&
        semver.gt(manualInfo.version, currentVersion)
      ) {
        console.log(`[Update] Manual update available: v${manualInfo.version}`);
        sendUpdateStatus("update-available", manualInfo.downloadUrl, manualInfo.version);
      } else {
        console.log("[Update] Manual check: No newer version available.");
        sendUpdateStatus("update-not-available");
      }
    }
  }

  const appBundleId = getAppBundleId(app.getVersion());
  electronApp.setAppUserModelId(appBundleId);
  registerIpcHandlers();
  createWindow();

  if (mainWindow) {
    if (is.dev) {
      // In dev, we load the dev server up immediately but do not show it yet
      mainWindow.loadURL(`http://localhost:${uiDevPort}`);
    }
  }

  // Start the background server (this might include downloading the CLI on first run)
  try {
    console.info("[Main] Starting standalone server...");
    await startServer();
    console.info("[Main] Standalone server is ready");

    // Once server is ready, load the real UI
    if (!is.dev) {
      console.info(`[Main] Loading production UI from localhost:${websocketPort}`);
      mainWindow?.loadURL(`http://localhost:${websocketPort}`);
    }
  } catch (error) {
    console.error("Failed to start standalone server:", error);
    dialog.showErrorBox(
      "Startup Error",
      "Failed to start the background server. This is required for Pipelab to function.\n\n" +
        (error instanceof Error ? error.message : String(error)),
    );
    app.quit();
    return;
  }

  if (app.isPackaged || process.env.FORCE_UPDATE_CHECK === "true") {
    setTimeout(() => {
      if (supportsAutoUpdate) {
        console.log("[Update] Triggering autoUpdater.checkForUpdates()...");
        autoUpdater.checkForUpdates();
      }
    }, 10000);
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    stopServer();
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  stopServer();
  app.exit(0);
});
