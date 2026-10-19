import { access } from "node:fs/promises";

export const showExistingItemInFolder = async (path: string, showItem: (path: string) => void) => {
  try {
    await access(path);
  } catch {
    throw new Error(`Artifact is missing or unavailable: ${path}`);
  }
  showItem(path);
};
