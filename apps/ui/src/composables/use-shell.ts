import { useUIStore } from "../store/ui";
import { useAPI } from "./api";

/**
 * Composable for interacting with the shell (Electron or Web fallback)
 */
export const useShell = () => {
  const { execute } = useAPI();
  const uiStore = useUIStore();

  /**
   * Open a file dialog
   */
  const openFile = async (options: any = {}) => {
    if ((window as any).electron) {
      try {
        // De-proxy reactive objects for Electron IPC
        const plainOptions = JSON.parse(JSON.stringify(options));

        const result = await (window as any).pipelab.showOpenDialog({
          ...plainOptions,
          properties: ["openFile", ...(plainOptions.properties || [])],
        });
        return { type: "success", result };
      } catch (e: any) {
        return {
          type: "error",
          ipcError: e.message,
        };
      }
    }

    const result = await uiStore.showFilePicker({
      ...options,
      mode: "open",
    });
    return {
      type: "success",
      result,
    };
  };

  /**
   * Open a directory dialog
   */
  const openDirectory = async (options: any = {}) => {
    if ((window as any).electron) {
      try {
        const plainOptions = JSON.parse(JSON.stringify(options));
        const result = await (window as any).pipelab.showOpenDialog({
          ...plainOptions,
          properties: ["openDirectory", ...(plainOptions.properties || [])],
        });
        return {
          type: "success",
          result,
        };
      } catch (e: any) {
        return {
          type: "error",
          ipcError: e.message,
        };
      }
    }

    const result = await uiStore.showFilePicker({
      ...options,
      mode: "open",
    });
    return {
      type: "success",
      result,
    };
  };

  /**
   * Open a save file dialog
   */
  const saveFile = async (options: any = {}) => {
    if ((window as any).electron) {
      try {
        const result = await (window as any).pipelab.showSaveDialog(
          JSON.parse(JSON.stringify(options)),
        );
        return {
          type: "success",
          result,
        };
      } catch (e: any) {
        return {
          type: "error",
          ipcError: e.message,
        };
      }
    }

    const result = await uiStore.showFilePicker({
      ...options,
      mode: "save",
    });
    return {
      type: "success",
      result,
    };
  };

  /**
   * Open an external URL
   */
  const openExternal = async (url: string) => {
    if ((window as any).electron) {
      return await (window as any).pipelab.openExternal(url);
    }
    window.open(url, "_blank");
  };

  /**
   * Show a file in the system file explorer
   */
  const showItemInFolder = (path: string) => {
    if ((window as any).electron) {
      return (window as any).pipelab.showItemInFolder(path);
    }
    console.warn("showItemInFolder not supported on web");
  };

  return {
    openFile,
    openDirectory,
    saveFile,
    openExternal,
    showItemInFolder,
  };
};
