import { useAPI } from "../ipc-core";
import { PipelabContext, isDev, projectRoot } from "../context";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// In dev the caller passes version "local" (monorepo source, not a release).
// Report the real CLI version from the workspace instead of a pseudo-version.
function resolveDevVersion(fallback: string): string {
  if (!isDev || !projectRoot || fallback !== "local") return fallback;
  try {
    const pkgPath = join(projectRoot, "apps", "cli", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.version) return pkg.version;
    }
  } catch {
    // fall through to caller-provided version
  }
  return fallback;
}

export const registerSystemHandlers = (options: { version: string; context: PipelabContext }) => {
  const { handle } = useAPI();

  handle("agent:version:get", async (_, { send }) => {
    const isStable =
      options.context.userDataPath.endsWith("app") ||
      !options.context.userDataPath.includes("app-beta");

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          version: resolveDevVersion(options.version),
          channel: isDev ? "dev" : isStable ? "stable" : "beta",
        },
      },
    });
  });

  handle("system:packages:cleanup", async (_, { send }) => {
    try {
      const packagesDir = options.context.getPackagesPath();
      const { existsSync } = await import("fs");
      const { rm } = await import("fs/promises");
      if (existsSync(packagesDir)) {
        await rm(packagesDir, { recursive: true, force: true });
      }
      send({
        type: "end",
        data: {
          type: "success",
          result: true,
        },
      });
    } catch (e: any) {
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: e.message,
        },
      });
    }
  });
};
