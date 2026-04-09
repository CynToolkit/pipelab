import { useAPI } from "./api";

/**
 * Composable for interacting with the shell (Electron or Web fallback)
 */
export const useShell = () => {
  const { execute } = useAPI();

  /**
   * Open a file dialog
   */
  const openFile = async (options: any = {}) => {
    if (!window.electron) {
      throw new Error("Not implemented for web yet");
    }

    return execute("dialog:showOpenDialog", {
      ...options,
      properties: ["openFile", ...(options.properties || [])],
    });
  };

  /**
   * Open a directory dialog
   */
  const openDirectory = async (options: any = {}) => {
    if (!window.electron) {
      throw new Error("Not implemented for web yet");
    }

    return execute("dialog:showOpenDialog", {
      ...options,
      properties: ["openDirectory", ...(options.properties || [])],
    });
  };

  /**
   * Open a save file dialog
   */
  const saveFile = async (options: any = {}) => {
    if (!window.electron) {
      throw new Error("Not implemented for web yet");
    }

    return execute("dialog:showSaveDialog", options);
  };

  return {
    openFile,
    openDirectory,
    saveFile,
  };
};
