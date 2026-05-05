import { app, shell, BrowserWindow, dialog, autoUpdater, screen, protocol, net } from "electron";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { platform } from "node:os";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { startServer, stopServer } from "./main/server-process";
import { websocketPort, uiDevPort } from "@pipelab/constants";
import { registerIpcHandlers } from "./main/ipc-handlers";
import { getDefaultUserDataPath, fetchLatestDesktopRelease } from "@pipelab/core-node";
import started from "electron-squirrel-startup";
import { PostHog } from "posthog-node";

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

app.setPath("userData", join(getDefaultUserDataPath(), "desktop"));

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
    },
  });

  if (is.dev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", function () {
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
}

if (is.dev && process.platform === "win32") {
  app.setAsDefaultProtocolClient("pipelab", process.execPath, [resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("pipelab");
}

const sendUpdateStatus = (status: string) => {
  mainWindow?.webContents.send("update:set-status", {
    data: { status },
    requestId: "shell-update",
  });
};

app.whenReady().then(async () => {
  if (!is.dev || process.env.APP_UPDATE_URL || process.env.PIPELAB_OVERRIDE_RELEASE || process.env.FORCE_UPDATE_CHECK === "true") {
    console.log("[Update] --- Auto-Updater Debug Info ---");
    console.log(`[Update] Platform: ${process.platform}`);
    console.log(`[Update] Arch: ${process.arch}`);
    console.log(`[Update] Current Version: ${app.getVersion()}`);
    console.log(`[Update] Is Packaged: ${app.isPackaged}`);
    console.log(`[Update] FORCE_UPDATE_CHECK: ${process.env.FORCE_UPDATE_CHECK}`);

    let updateUrl =
      process.env.APP_UPDATE_URL ||
      "https://github.com/CynToolkit/pipelab/releases/latest/download";

    // 1. Try to resolve the latest desktop-specific release from GitHub
    if (!process.env.APP_UPDATE_URL) {
      const currentVersion = app.getVersion();
      const isPrerelease = currentVersion.includes("-") || process.env.PRERELEASE === "true";

      console.log(`[Update] Fetching ${isPrerelease ? "beta" : "stable"} releases from GitHub API...`);

      const release = await fetchLatestDesktopRelease({ allowPrerelease: isPrerelease });
      if (release) {
        updateUrl = `https://github.com/CynToolkit/pipelab/releases/download/${release.tag_name}`;
        console.log(`[Update] Target Tag: ${release.tag_name}`);
        console.log(`[Update] Release API URL: ${release.html_url}`);
      } else {
        console.warn("[Update] No desktop release found, using fallback URL");
      }
    }

    console.log(`[Update] Final Feed URL: ${updateUrl}`);
    if (process.platform === "win32") {
      console.log(`[Update] (Windows) Squirrel will request: ${updateUrl}/RELEASES`);
    }

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
        detail: "A new version has been downloaded. Restart the application to apply the updates.",
      };

      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on("error", (message) => {
      sendUpdateStatus("error");
      console.error("[Update] There was a problem updating the application:", message);
    });
  }

  electronApp.setAppUserModelId("com.pipelab");
  createWindow();

  if (mainWindow) {
    registerIpcHandlers();

    // Show a splash screen/loading state while waiting for the server
    if (is.dev) {
      // In dev, we might already have the dev server up
      mainWindow.loadURL(`http://localhost:${uiDevPort}`);
    } else {
      // In prod, load the local bundled index.html as a splash screen
      // The Forge Vite plugin exposes these globals
      if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined") {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
      }
    }

    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
      mainWindow?.maximize();
    });
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
      (error instanceof Error ? error.message : String(error))
    );
    app.quit();
    return;
  }

  if (app.isPackaged || process.env.FORCE_UPDATE_CHECK === "true") {
    setTimeout(() => {
      console.log("[Update] Triggering autoUpdater.checkForUpdates()...");
      autoUpdater.checkForUpdates();
    }, 10000);
  }

  protocol.handle("media", (request) => {
    const path = decodeURIComponent(request.url.replace(/^media:\/\/+/, "/"));
    return net.fetch(pathToFileURL(path).toString());
  });

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
