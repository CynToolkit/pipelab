export interface SystemContext {
  userDataPath: string;
  assetsPath?: string;
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath: string | undefined }>;
  getMainWindow?: () => any;
  getPluginAPI?: (mainWindow: any) => any;
}

let context: SystemContext;

export const setSystemContext = (ctx: SystemContext) => {
  context = ctx;
};

export const getSystemContext = (): SystemContext => {
  if (!context) {
    throw new Error("SystemContext not initialized. Call setSystemContext first.");
  }
  return context;
};
