import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { stat, readdir, writeFile, mkdir } from "node:fs/promises";

import { ensure, isPathBlacklisted } from "@pipelab/core-node";
export { ensure, isPathBlacklisted };

/**
 * Asserts that a directory is safe to be deleted/cleaned up.
 * Throws an error if the directory is protected or is not empty and lacks the Pipelab folder marker.
 */
export async function assertSafeDirectoryCleanup(directoryPath: string): Promise<void> {
  if (!directoryPath) return;
  const resolvedPath = resolve(directoryPath);

  if (isPathBlacklisted(resolvedPath)) {
    throw new Error(`Cannot cleanup/delete protected system or user directory: ${resolvedPath}`);
  }

  try {
    const destStats = await stat(resolvedPath);
    if (destStats.isDirectory()) {
      const files = await readdir(resolvedPath);
      if (files.length > 0) {
        const hasMarker = files.includes(".pipelab");
        if (!hasMarker) {
          throw new Error(
            `Directory is not empty and was not created by Pipelab: ${resolvedPath}. Aborting to prevent data loss.`,
          );
        }
      }
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }
}

/**
 * Creates a hidden Pipelab marker directory with metadata.json at the specified destination path.
 */
export async function writePipelabFolderMarker(
  directoryPath: string,
  generator = "unknown",
): Promise<void> {
  if (!directoryPath) return;
  const markerDir = join(directoryPath, ".pipelab");
  await mkdir(markerDir, { recursive: true });
  await writeFile(
    join(markerDir, "metadata.json"),
    JSON.stringify({ createdBy: generator, timestamp: Date.now() }, null, 2),
    "utf-8",
  );
}
