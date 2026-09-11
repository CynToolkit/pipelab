import { useAPI } from "../ipc-core";
import { useLogger } from "@pipelab/shared";
import { writeFile, readFile, readdir, stat, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { isPathBlacklisted } from "../fs-utils";

import { PipelabContext } from "../context";

export const registerFsHandlers = (_context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("fs:read", async (event, { value, send }) => {
    logger().info("fs:read", value.path);

    try {
      const data = await readFile(value.path, "utf-8");
      logger().info("fs:read success, content length:", data.length);

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            content: data,
          },
        },
      });
    } catch (e) {
      logger().error("fs:read error for path:", value.path, e);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: "Unable to read file",
        },
      });
    }
  });

  handle("fs:write", async (event, { value, send }) => {
    await writeFile(value.path, value.content, "utf-8");

    send({
      type: "end",
      data: {
        type: "success",
        result: {
          ok: true,
        },
      },
    });
  });

  handle("fs:listDirectory", async (event, { value, send }) => {
    try {
      const entries = await readdir(value.path, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(value.path, entry.name);
          let stats: any = {};
          try {
            stats = await stat(fullPath);
          } catch (e) {
            // Might happen for broken symlinks etc
          }

          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isSymbolicLink: entry.isSymbolicLink(),
            size: stats.size || 0,
            mtime: stats.mtime?.getTime() || 0,
          };
        }),
      );

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            files,
          },
        },
      });
    } catch (error) {
      logger().error("Failed to list directory:", error);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Unable to list directory",
        },
      });
    }
  });

  handle("fs:createDirectory", async (event, { value, send }) => {
    try {
      await mkdir(value.path);
      send({ type: "end", data: { type: "success", result: { ok: true } } });
    } catch (error) {
      logger().error("Failed to create directory:", error);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Unable to create directory",
        },
      });
    }
  });

  handle("fs:getRoots", async (event, { send }) => {
    try {
      const roots: { name: string; path: string }[] = [{ name: "Home", path: homedir() }];
      if (platform() === "win32") {
        const available = await Promise.all(
          Array.from({ length: 26 }, (_, i) => {
            const letter = String.fromCharCode(65 + i);
            const path = `${letter}:\\`;
            return access(path, constants.R_OK)
              .then(() => ({ name: `${letter}:`, path }))
              .catch(() => null);
          }),
        );
        roots.push(...available.filter((root): root is { name: string; path: string } => !!root));
      } else {
        roots.push({ name: "Computer", path: "/" });
        for (const mountRoot of ["/Volumes", "/mnt", "/media", "/run/media"]) {
          try {
            const entries = await readdir(mountRoot, { withFileTypes: true });
            roots.push(
              ...entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => ({ name: entry.name, path: `${mountRoot}/${entry.name}` })),
            );
          } catch {
            // Mount roots are platform/configuration dependent.
          }
        }
      }
      const unique = [...new Map(roots.map((root) => [root.path, root])).values()];
      send({ type: "end", data: { type: "success", result: { roots: unique } } });
    } catch (error) {
      logger().error("Failed to list filesystem roots:", error);
      send({ type: "end", data: { type: "error", ipcError: "Unable to list filesystem roots" } });
    }
  });

  handle("fs:isPathBlacklisted", async (event, { value, send }) => {
    try {
      const isBlacklisted = isPathBlacklisted(value.path);
      send({
        type: "end",
        data: {
          type: "success",
          result: {
            isBlacklisted,
          },
        },
      });
    } catch (error) {
      logger().error("Failed to check blacklist for path:", error);
      send({
        type: "end",
        data: {
          type: "error",
          ipcError: error instanceof Error ? error.message : "Unable to check path blacklist",
        },
      });
    }
  });
};
