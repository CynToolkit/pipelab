import { app, shell, BrowserWindow, dialog, autoUpdater, screen } from "electron";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { startServer, stopServer } from "./main/server-process";
import { createRequire } from "node:module";
import { websocketPort, uiDevPort } from "@pipelab/constants";
import { registerIpcHandlers } from "./main/ipc-handlers";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (is.dev) {
  app.setPath("userData", app.getPath("userData") + "-dev");
}

function getIconPath() {
  let ext = ".png";
  if (platform() === "win32") ext = ".ico";
  else if (platform() === "darwin") ext = ".icns";
  return join("./assets", "build", `icon${ext}`);
}

if (process.platform === "win32" && process.env.TEST !== "true" && app.isPackaged) {
  const require = createRequire(import.meta.url);
  if (require("electron-squirrel-startup")) {
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

  if (is.dev) {
    mainWindow.loadURL(`http://localhost:${uiDevPort}`);
  } else {
    mainWindow.loadURL(`http://localhost:${websocketPort}`);
  }
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
  if (!is.dev) {
    autoUpdater.setFeedURL({
      url: "https://github.com/CynToolkit/pipelab/releases/latest/download",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking-for-update"));
    autoUpdater.on("update-available", () => sendUpdateStatus("update-available"));
    autoUpdater.on("update-not-available", () => sendUpdateStatus("update-not-available"));

    autoUpdater.on("update-downloaded", (event, releaseNotes, releaseName) => {
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
      console.error("There was a problem updating the application", message);
    });
  }

  electronApp.setAppUserModelId("com.pipelab");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  try {
    await startServer();
    console.info("Standalone server is ready, creating window");
  } catch (error) {
    console.error("Failed to start standalone server:", error);
    process.exit(1);
  }

  createWindow();

  if (mainWindow) {
    registerIpcHandlers(mainWindow);
  }

  mainWindow?.on("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.maximize();

    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 10000);
    }
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
