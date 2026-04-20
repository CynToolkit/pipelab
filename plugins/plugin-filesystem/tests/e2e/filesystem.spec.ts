import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runPipeline, findProjectRoot } from "@pipelab/test-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = findProjectRoot(__dirname);

describe("End-to-End: Filesystem Plugin", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("fs-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test("should copy a file using 'copy' node", { timeout: 60000 }, async () => {
    const testPath = join(sandbox.path, "copy");
    const sourcePath = join(testPath, "source");
    const destPath = join(testPath, "destination");
    await mkdir(sourcePath, { recursive: true });
    await mkdir(destPath, { recursive: true });

    const sourceFile = join(sourcePath, "file.txt");
    const destFile = join(destPath, "file.txt");
    await writeFile(sourceFile, "Hello World");

    const pipeline = {
      graph: [
        {
          uid: "copy-node",
          name: "Copy File Node",
          type: "action",
          origin: { pluginId: "filesystem", nodeId: "fs:copy" },
          params: {
            from: { value: JSON.stringify(sourceFile) },
            to: { value: JSON.stringify(destFile) },
            recursive: { value: JSON.stringify(false) },
            overwrite: { value: JSON.stringify(false) },
            cleanup: { value: JSON.stringify(false) },
          },
        },
      ],
    };

    const result = await runPipeline(pipeline, testPath, projectRoot);

    await expect(access(destFile)).resolves.not.toThrow();
    const content = await readFile(destFile, "utf-8");
    expect(content).toBe("Hello World");
  });

  test("should move a file using 'move' node", { timeout: 60000 }, async () => {
    const testPath = join(sandbox.path, "move");
    const sourcePath = join(testPath, "source");
    const destPath = join(testPath, "destination");
    await mkdir(sourcePath, { recursive: true });
    await mkdir(destPath, { recursive: true });

    const sourceFile = join(sourcePath, "file.txt");
    const destFile = join(destPath, "file.txt");
    await writeFile(sourceFile, "File to move");

    const pipeline = {
      graph: [
        {
          uid: "copy-node-move",
          name: "Copy for move",
          type: "action",
          origin: { pluginId: "filesystem", nodeId: "fs:copy" },
          params: {
            from: { value: JSON.stringify(sourceFile) },
            to: { value: JSON.stringify(destFile) },
            recursive: { value: JSON.stringify(false) },
            overwrite: { value: JSON.stringify(false) },
            cleanup: { value: JSON.stringify(false) },
          },
        },
        {
          uid: "delete-node-move",
          name: "Delete for move",
          type: "action",
          origin: { pluginId: "filesystem", nodeId: "fs:remove" },
          params: {
            from: { value: JSON.stringify(sourceFile) },
            recursive: { value: JSON.stringify(true) },
          },
        },
      ],
    };

    await runPipeline(pipeline, testPath, projectRoot);

    await expect(access(destFile)).resolves.not.toThrow();
    await expect(access(sourceFile)).rejects.toThrow();
  });

  test("should delete a file using 'delete' node", { timeout: 60000 }, async () => {
    const testPath = join(sandbox.path, "delete");
    await mkdir(testPath, { recursive: true });
    const fileToDelete = join(testPath, "file_to_delete.txt");
    await writeFile(fileToDelete, "Delete me");

    const pipeline = {
      graph: [
        {
          uid: "remove-node",
          name: "Remove File Node",
          type: "action",
          origin: { pluginId: "filesystem", nodeId: "fs:remove" },
          params: {
            from: { value: JSON.stringify(fileToDelete) },
            recursive: { value: JSON.stringify(true) },
          },
        },
      ],
    };

    await runPipeline(pipeline, testPath, projectRoot);

    await expect(access(fileToDelete)).rejects.toThrow();
  });
});
