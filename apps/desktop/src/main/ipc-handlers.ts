import { ipcMain, dialog, BrowserWindow } from "electron";

export const registerIpcHandlers = (mainWindow: BrowserWindow) => {
  ipcMain.on("dialog:showOpenDialog", async (event, message) => {
    const { requestId, data } = message;
    const result = await dialog.showOpenDialog(mainWindow, data);

    event.reply("dialog:showOpenDialog", {
      requestId,
      type: "end",
      data: {
        type: "success",
        result: {
          canceled: result.canceled,
          filePaths: result.filePaths,
        },
      },
    });
  });

  ipcMain.on("dialog:showSaveDialog", async (event, message) => {
    const { requestId, data } = message;
    const result = await dialog.showSaveDialog(mainWindow, data);

    event.reply("dialog:showSaveDialog", {
      requestId,
      type: "end",
      data: {
        type: "success",
        result: {
          canceled: result.canceled,
          filePath: result.filePath,
        },
      },
    });
  });
};
