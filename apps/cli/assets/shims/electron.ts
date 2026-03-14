export const app = {
  getPath: (name: string) => {
    console.warn(`electron.app.getPath("${name}") called in CLI mode, returning empty string`);
    return "";
  },
  on: () => {},
  whenReady: () => Promise.resolve(),
};

export const shell = {
  openExternal: async (url: string) => {
    console.warn(`electron.shell.openExternal("${url}") called in CLI mode`);
  },
};

export const BrowserWindow = class {
  loadURL() {}
  on() {}
  webContents = {
    on: () => {},
  };
};
