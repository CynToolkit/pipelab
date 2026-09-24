import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const normalizePath = (value: string) =>
  value
    .replace(/[\\/]+$/, "")
    .replaceAll("\\", "/")
    .toLowerCase();
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
    homeDirectory,
    join(homeDirectory, "Downloads"),
    join(homeDirectory, "Documents"),
    join(homeDirectory, "Desktop"),
    join(homeDirectory, ".config"),
    join(homeDirectory, ".local"),
    join(homeDirectory, ".cache"),
    join(homeDirectory, ".ssh"),
    join(homeDirectory, ".gnupg"),
    join(homeDirectory, ".aws"),
    join(homeDirectory, ".docker"),
    join(homeDirectory, ".kube"),
    join(homeDirectory, ".npm"),
    join(homeDirectory, ".pnpm-state"),
    process.cwd(),
    "/tmp",
    "/var/tmp",
    process.env.TEMP,
    process.env.TMP,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizePath),
);

export function isWorkflowPathProtected(pathToCheck: string): boolean {
  if (!pathToCheck) return false;
  const normalized = normalizePath(resolve(pathToCheck));
  return (
    normalized === homeDirectory ||
    protectedDirectories.has(normalized) ||
    /^[a-z]:$/.test(normalized)
  );
}

export async function assertSafeDirectoryCleanup(directoryPath: string): Promise<void> {
  if (!directoryPath) return;
  const resolvedPath = resolve(directoryPath);
  if (isWorkflowPathProtected(resolvedPath)) {
    throw new Error(`Cannot cleanup/delete protected system or user directory: ${resolvedPath}`);
  }

  try {
    const destinationStats = await stat(resolvedPath);
    if (destinationStats.isDirectory()) {
      const entries = await readdir(resolvedPath);
      if (entries.length > 0 && !entries.includes(".pipelab")) {
        throw new Error(
          `Directory is not empty and was not created by Pipelab: ${resolvedPath}. Aborting to prevent data loss.`,
        );
      }
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

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

export interface CopyPathOptions {
  from: string;
  to: string;
  recursive?: boolean;
  overwrite?: boolean;
  cleanup?: boolean;
  log?: (...args: unknown[]) => void;
}

export interface CopyPathResult {
  output: string;
  input: string;
  parentDirectory: string;
}

export async function copyPath({
  from,
  to: requestedDestination,
  recursive = true,
  overwrite = true,
  cleanup = false,
  log = () => undefined,
}: CopyPathOptions): Promise<CopyPathResult> {
  if (!from) throw new Error("Missing source");
  if (!requestedDestination) throw new Error("Missing destination");

  let sourceIsFile: boolean;
  try {
    sourceIsFile = (await stat(from)).isFile();
  } catch (error) {
    log("Error getting file stats", error);
    throw error;
  }
  let to = requestedDestination;
  if (sourceIsFile) {
    try {
      if ((await stat(to)).isDirectory()) to = join(to, basename(from));
    } catch {
      // Missing or inaccessible destinations are treated as explicit output paths.
    }
  }

  log("Copying", from, "to", to, "recursive", recursive, "overwrite", overwrite);
  if (cleanup) {
    try {
      await assertSafeDirectoryCleanup(to);
      log("Cleaning up", to);
      const processWithAsar = process as NodeJS.Process & { noAsar?: boolean };
      const previousNoAsar = processWithAsar.noAsar;
      processWithAsar.noAsar = true;
      try {
        await rm(to, { recursive: true, force: true, maxRetries: 3 });
        if (!sourceIsFile) await mkdir(to, { recursive: true });
      } finally {
        processWithAsar.noAsar = previousNoAsar;
      }
    } catch (error) {
      log("Error cleaning up file", error);
      throw error;
    }
  }

  const processWithAsar = process as NodeJS.Process & { noAsar?: boolean };
  const previousNoAsar = processWithAsar.noAsar;
  processWithAsar.noAsar = true;
  try {
    await cp(from, to, { recursive: recursive && !sourceIsFile, force: overwrite });
    if (!sourceIsFile) await writePipelabFolderMarker(to, "fs:copy");
    log("Copied", from, "to", to);
  } catch (error) {
    log("Error copying file", error);
    throw error;
  } finally {
    processWithAsar.noAsar = previousNoAsar;
  }

  return { output: to, input: from, parentDirectory: dirname(to) };
}

export async function removePath(
  from: string,
  options: { recursive?: boolean; log?: (...args: unknown[]) => void } = {},
): Promise<void> {
  if (!from) throw new Error("Missing source");
  const { recursive = true, log = () => undefined } = options;
  log("Removing", from, recursive);
  await assertSafeDirectoryCleanup(from);
  const processWithAsar = process as NodeJS.Process & { noAsar?: boolean };
  const previousNoAsar = processWithAsar.noAsar;
  processWithAsar.noAsar = true;
  try {
    await rm(from, { recursive, force: true, maxRetries: 3 });
  } finally {
    processWithAsar.noAsar = previousNoAsar;
  }
  log("Removed", from);
}
