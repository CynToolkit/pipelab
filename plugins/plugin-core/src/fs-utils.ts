import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { stat, writeFile, mkdir, mkdir as mkdirP } from "node:fs/promises";
import { assertSafeDirectoryCleanup, writePipelabFolderMarker } from "@pipelab/workflow-runtime";

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
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizePath),
);

export function isPathBlacklisted(pathToCheck: string): boolean {
  if (!pathToCheck) return false;
  const normalized = normalizePath(resolve(pathToCheck));
  return (
    normalized === homeDirectory ||
    protectedDirectories.has(normalized) ||
    /^[a-z]:$/.test(normalized)
  );
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

export { assertSafeDirectoryCleanup, writePipelabFolderMarker };
