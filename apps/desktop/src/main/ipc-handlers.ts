import { ipcMain, dialog, BrowserWindow, shell, app } from "electron";
import { isPathBlacklisted } from "@pipelab/plugin-core";

export const registerIpcHandlers = () => {
  console.log("[Main] Registering IPC handlers");

  const OPEN_DIALOG_CHANNEL = "dialog:showOpenDialog";
  const SAVE_DIALOG_CHANNEL = "dialog:showSaveDialog";

  ipcMain.removeHandler(OPEN_DIALOG_CHANNEL);
  ipcMain.handle(OPEN_DIALOG_CHANNEL, async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showOpenDialog(win!, options);
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  });

  ipcMain.removeHandler(SAVE_DIALOG_CHANNEL);
  ipcMain.handle(SAVE_DIALOG_CHANNEL, async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showSaveDialog(win!, options);
    return {
      canceled: result.canceled,
      filePath: result.filePath,
    };
  });

  ipcMain.handle("shell:openExternal", async (event, url) => {
    return await shell.openExternal(url);
  });

  ipcMain.handle("shell:showItemInFolder", (event, path) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle("window:show", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      console.info("[Main] Received window:show request, showing and maximizing window");
      win.show();
      win.maximize();
    } else {
      console.error("[Main] Received window:show request but could not resolve window from sender");
    }
  });

  ipcMain.handle("app:version:get", () => {
    return app.getVersion();
  });

  ipcMain.handle("path:isBlacklisted", (event, pathToCheck: string) => {
    return isPathBlacklisted(pathToCheck);
  });
};
