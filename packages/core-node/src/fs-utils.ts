import { homedir } from "node:os";
import { resolve, join } from "node:path";
import slash from "slash";

function removeTrailingSlash(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function isWindowsDriveRoot(path: string): boolean {
  return /^[a-z]:$/.test(path);
}

import { getDefaultUserDataPath, projectRoot } from "./context";

const windowsSystemFolders = [
  "windows",
  "program files",
  "program files (x86)",
  "users",
  "programdata",
  "perflogs",
];

function isWindowsSystemDirectory(path: string): boolean {
  const driveRoot = path.substring(0, 2);
  if (!isWindowsDriveRoot(driveRoot) || path.charAt(2) !== "/") return false;
  const folder = path.substring(3);
  return windowsSystemFolders.includes(folder);
}

// Static Unix/Linux/macOS system directories (normalized)
const unixSystemDirectories = new Set([
  "", // represents "/" after removeTrailingSlash
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
]);

// Statically resolved home directory, user directories, temp directories, and Pipelab's AppData
const homeDirectory = removeTrailingSlash(slash(resolve(homedir()))).toLowerCase();

const additionalProtectedPaths = [
  // Pipelab user data directories (dev, beta, prod)
  getDefaultUserDataPath("dev"),
  getDefaultUserDataPath("beta"),
  getDefaultUserDataPath("prod"),
  // Pipelab source directory if available
  projectRoot,
  // Current working directory of the process
  process.cwd(),
  // System temp directories
  "/tmp",
  "/var/tmp",
  process.env.TEMP,
  process.env.TMP,
  // Windows AppData roots
  join(homedir(), "AppData"),
  join(homedir(), "AppData", "Local"),
  join(homedir(), "AppData", "Roaming"),
  // macOS / Unix config roots
  join(homedir(), "Library"),
  join(homedir(), "Library", "Application Support"),
  join(homedir(), ".config"),
  join(homedir(), ".local"),
  join(homedir(), ".local", "share"),
  join(homedir(), ".cache"),
  // Cloud directories
  join(homedir(), "OneDrive"),
  join(homedir(), "Dropbox"),
  // Critical SSH/GPG credentials folders
  join(homedir(), ".ssh"),
  join(homedir(), ".gnupg"),
  // Developer CLI configurations
  join(homedir(), ".aws"),
  join(homedir(), ".docker"),
  join(homedir(), ".kube"),
  // IDE environments
  join(homedir(), ".vscode"),
  join(homedir(), ".vscode-insiders"),
  join(homedir(), ".cursor"),
  // Package manager / toolchain directories
  join(homedir(), ".npm"),
  join(homedir(), ".pnpm-state"),
  join(homedir(), ".yarn"),
  join(homedir(), ".cargo"),
  join(homedir(), ".rustup"),
  join(homedir(), ".m2"),
  join(homedir(), ".gradle"),
].filter((p): p is string => typeof p === "string" && p.length > 0);

const userSubdirectories = new Set(
  [
    join(homedir(), "Downloads"),
    join(homedir(), "Documents"),
    join(homedir(), "Desktop"),
    join(homedir(), "Pictures"),
    join(homedir(), "Music"),
    join(homedir(), "Videos"),
    join(homedir(), "Saved Games"),
    join(homedir(), "Contacts"),
    join(homedir(), "Searches"),
    join(homedir(), "Links"),
    join(homedir(), "3D Objects"),
    ...additionalProtectedPaths,
  ].map((p) => removeTrailingSlash(slash(resolve(p))).toLowerCase()),
);

/**
 * Checks if a path matches a critical user or system directory.
 */
export function isPathBlacklisted(pathToCheck: string): boolean {
  if (!pathToCheck) return false;
  const normalized = removeTrailingSlash(slash(resolve(pathToCheck))).toLowerCase();

  return (
    normalized === homeDirectory ||
    unixSystemDirectories.has(normalized) ||
    userSubdirectories.has(normalized) ||
    isWindowsDriveRoot(normalized) ||
    isWindowsSystemDirectory(normalized)
  );
}
