import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { stat, readdir, writeFile, mkdir, mkdir as mkdirP } from "node:fs/promises";

const normalizePath = (value: string) => value.replace(/[\\/]+$/, "").replaceAll("\\", "/").toLowerCase();
const homeDirectory = normalizePath(resolve(homedir()));
const protectedDirectories = new Set(
  [
    "",
    "/usr",
    "/var",
    "/opt",
    "/etc",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/boot",
    "/sys",
    "/proc",
    "/dev",
    "/run",
    "/home",
    "/root",
    "/mnt",
    "/media",
    "/srv",
    "/applications",
    "/library",
    "/system",
    "/volumes",
    "/snap",
    homedir(),
    join(homedir(), "Downloads"),
    join(homedir(), "Documents"),
    join(homedir(), "Desktop"),
    join(homedir(), ".config"),
    join(homedir(), ".local"),
    join(homedir(), ".cache"),
    join(homedir(), ".ssh"),
    join(homedir(), ".gnupg"),
    join(homedir(), ".aws"),
    join(homedir(), ".docker"),
    join(homedir(), ".kube"),
    join(homedir(), ".npm"),
    join(homedir(), ".pnpm-state"),
    process.cwd(),
    "/tmp",
    "/var/tmp",
    process.env.TEMP,
    process.env.TMP,
  ].filter((value): value is string => Boolean(value)).map(normalizePath),
);

export function isPathBlacklisted(pathToCheck: string): boolean {
  if (!pathToCheck) return false;
  const normalized = normalizePath(resolve(pathToCheck));
  return normalized === homeDirectory || protectedDirectories.has(normalized) || /^[a-z]:$/.test(normalized);
}

export const ensure = async (filesPath: string, defaultContent = "{}") => {
  await mkdirP(dirname(filesPath), { recursive: true });
  try {
    const current = await stat(filesPath);
    if (current.size === 0) await writeFile(filesPath, defaultContent);
  } catch {
    await writeFile(filesPath, defaultContent);
  }
};

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
