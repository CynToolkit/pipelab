import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction } from "@pipelab/test-utils";
import { copyRunner } from "../../src/copy";
import { removeRunner } from "../../src/remove";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("End-to-End: Filesystem Plugin", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test("should copy a file using 'copy' action", { timeout: 60000 }, async () => {
    sandbox = await createSandbox("fs-copy-e2e");
    const testPath = sandbox.path;
    const sourcePath = join(testPath, "source");
    const destPath = join(testPath, "destination");
    await mkdir(sourcePath, { recursive: true });
    await mkdir(destPath, { recursive: true });

    const sourceFile = join(sourcePath, "file.txt");
    const destFile = join(destPath, "file.txt");
    await writeFile(sourceFile, "Hello World");

    await runAction(copyRunner, {
      inputs: {
        from: sourceFile,
        to: destFile,
        recursive: false,
        overwrite: false,
        cleanup: false,
      },
      sandboxPath: testPath,
    });

    await expect(access(destFile)).resolves.not.toThrow();
    const content = await readFile(destFile, "utf-8");
    expect(content).toBe("Hello World");
  });

  test("should move a file using 'copy' then 'remove' actions", { timeout: 60000 }, async () => {
    sandbox = await createSandbox("fs-move-e2e");
    const testPath = sandbox.path;
    const sourcePath = join(testPath, "source");
    const destPath = join(testPath, "destination");
    await mkdir(sourcePath, { recursive: true });
    await mkdir(destPath, { recursive: true });

    const sourceFile = join(sourcePath, "file.txt");
    const destFile = join(destPath, "file.txt");
    await writeFile(sourceFile, "File to move");

    // Copy
    await runAction(copyRunner, {
      inputs: {
        from: sourceFile,
        to: destFile,
        recursive: false,
        overwrite: false,
        cleanup: false,
      },
      sandboxPath: testPath,
    });

    // Remove
    await runAction(removeRunner, {
      inputs: {
        from: sourceFile,
        recursive: true,
      },
      sandboxPath: testPath,
    });

    await expect(access(destFile)).resolves.not.toThrow();
    await expect(access(sourceFile)).rejects.toThrow();
  });

  test("should delete a file using 'remove' action", { timeout: 60000 }, async () => {
    sandbox = await createSandbox("fs-remove-e2e");
    const testPath = sandbox.path;
    await mkdir(testPath, { recursive: true });
    const fileToDelete = join(testPath, "file_to_delete.txt");
    await writeFile(fileToDelete, "Delete me");

    await runAction(removeRunner, {
      inputs: {
        from: fileToDelete,
        recursive: true,
      },
      sandboxPath: testPath,
    });

    await expect(access(fileToDelete)).rejects.toThrow();
  });
});
