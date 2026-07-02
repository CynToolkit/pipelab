import { describe, test, expect } from "vitest";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import slash from "slash";
import { isPathBlacklisted } from "./fs-utils";
import { getDefaultUserDataPath, projectRoot } from "./context";

const isWindows = process.platform === "win32";

describe("isPathBlacklisted", () => {
  test("should return false for empty or falsy paths", () => {
    expect(isPathBlacklisted("")).toBe(false);
    expect(isPathBlacklisted(undefined as any)).toBe(false);
    expect(isPathBlacklisted(null as any)).toBe(false);
  });

  test("should return false for safe user workspace paths", () => {
    const safePath = join(homedir(), "my-custom-projects", "project-1");
    expect(isPathBlacklisted(safePath)).toBe(false);
  });

  test("should blacklist user home directory", () => {
    expect(isPathBlacklisted(homedir())).toBe(true);
    expect(isPathBlacklisted(homedir() + "/")).toBe(true);
  });

  test("should blacklist common system paths on Unix-like systems", () => {
    // These Unix paths are checked as absolute paths starting with /
    expect(isPathBlacklisted("/usr")).toBe(true);
    expect(isPathBlacklisted("/var")).toBe(true);
    expect(isPathBlacklisted("/etc")).toBe(true);
    expect(isPathBlacklisted("/bin")).toBe(true);
    expect(isPathBlacklisted("/sbin")).toBe(true);
    expect(isPathBlacklisted("/lib")).toBe(true);
    expect(isPathBlacklisted("/lib64")).toBe(true);
    expect(isPathBlacklisted("/boot")).toBe(true);
    expect(isPathBlacklisted("/sys")).toBe(true);
    expect(isPathBlacklisted("/proc")).toBe(true);
    expect(isPathBlacklisted("/dev")).toBe(true);
    expect(isPathBlacklisted("/run")).toBe(true);
    expect(isPathBlacklisted("/home")).toBe(true);
    expect(isPathBlacklisted("/root")).toBe(true);
    expect(isPathBlacklisted("/mnt")).toBe(true);
    expect(isPathBlacklisted("/media")).toBe(true);
    expect(isPathBlacklisted("/srv")).toBe(true);
    expect(isPathBlacklisted("/applications")).toBe(true);
    expect(isPathBlacklisted("/library")).toBe(true);
    expect(isPathBlacklisted("/system")).toBe(true);
    expect(isPathBlacklisted("/volumes")).toBe(true);
    expect(isPathBlacklisted("/snap")).toBe(true);
    expect(isPathBlacklisted("/")).toBe(true);
  });

  test.runIf(isWindows)(
    "should blacklist common Windows directories dynamically on any drive (Windows-only)",
    () => {
      // Windows drive roots
      expect(isPathBlacklisted("c:")).toBe(true);
      expect(isPathBlacklisted("d:")).toBe(true);
      expect(isPathBlacklisted("Z:")).toBe(true);
      expect(isPathBlacklisted("C:\\")).toBe(true);
      expect(isPathBlacklisted("d:/")).toBe(true);

      // Windows system directories on any drive letter
      expect(isPathBlacklisted("c:/windows")).toBe(true);
      expect(isPathBlacklisted("D:\\Windows\\")).toBe(true);
      expect(isPathBlacklisted("e:/program files")).toBe(true);
      expect(isPathBlacklisted("f:/program files (x86)")).toBe(true);
      expect(isPathBlacklisted("g:/users")).toBe(true);
      expect(isPathBlacklisted("h:/programdata")).toBe(true);
      expect(isPathBlacklisted("i:/perflogs")).toBe(true);

      // Should NOT blacklist normal subfolders on other drives
      expect(isPathBlacklisted("d:/my-folder")).toBe(false);
      expect(isPathBlacklisted("c:/windows-backup")).toBe(false);
    },
  );

  test("should blacklist standard user profile directories", () => {
    expect(isPathBlacklisted(join(homedir(), "Downloads"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Documents"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Desktop"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Pictures"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Music"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Videos"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Saved Games"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Contacts"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Searches"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "Links"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), "3D Objects"))).toBe(true);
  });

  test("should blacklist developer settings and credentials", () => {
    expect(isPathBlacklisted(join(homedir(), ".ssh"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".gnupg"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".aws"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".docker"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".kube"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".vscode"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".cursor"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".npm"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".pnpm-state"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".yarn"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".cargo"))).toBe(true);
    expect(isPathBlacklisted(join(homedir(), ".rustup"))).toBe(true);
  });

  test("should blacklist Pipelab-specific directories", () => {
    expect(isPathBlacklisted(getDefaultUserDataPath("prod"))).toBe(true);
    expect(isPathBlacklisted(getDefaultUserDataPath("dev"))).toBe(true);
    expect(isPathBlacklisted(getDefaultUserDataPath("beta"))).toBe(true);
    if (projectRoot) {
      expect(isPathBlacklisted(projectRoot)).toBe(true);
    }
    expect(isPathBlacklisted(process.cwd())).toBe(true);
  });

  test("should handle case-insensitive paths and slash normalization", () => {
    const mixedPath = join(homedir(), "DoWnLoAdS");
    expect(isPathBlacklisted(mixedPath)).toBe(true);

    const trailingSlashPath = homedir() + "/";
    expect(isPathBlacklisted(trailingSlashPath)).toBe(true);
  });
});
