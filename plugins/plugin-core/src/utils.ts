import { Options, Subprocess } from "execa";
export {
  fetchPackage,
  fetchPipelabAsset,
  fetchPipelabPlugin,
  fetchPipelabCli,
  runPnpm,
  downloadFile,
  runWithLiveLogs,
} from "@pipelab/core-node";

/**
 * Re-exporting hooks type for backward compatibility
 */
export type { DownloadHooks as Hooks } from "@pipelab/core-node";

// Keep runtime-only utilities that don't depend on complex engine state
export const fileExists = async (path: string): Promise<boolean> => {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
};
