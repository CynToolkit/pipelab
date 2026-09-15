type CoreNodeModule = typeof import("@pipelab/core-node");

const coreNode = () => import("@pipelab/core-node");

export const fetchPackage: CoreNodeModule["fetchPackage"] = (...args) =>
  coreNode().then(({ fetchPackage }) => fetchPackage(...args));
export const resolveBundledAsset: CoreNodeModule["resolveBundledAsset"] = (...args) =>
  Promise.resolve(coreNode()).then(({ resolveBundledAsset }) => resolveBundledAsset(...args));
export const runPnpm: CoreNodeModule["runPnpm"] = (...args) =>
  coreNode().then(({ runPnpm }) => runPnpm(...args));
export const downloadFile: CoreNodeModule["downloadFile"] = (...args) =>
  coreNode().then(({ downloadFile }) => downloadFile(...args));
export const runWithLiveLogs: CoreNodeModule["runWithLiveLogs"] = (...args) =>
  coreNode().then(({ runWithLiveLogs }) => runWithLiveLogs(...args));

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
