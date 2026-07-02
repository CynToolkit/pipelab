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

  test("should copy a file using 'copy' action", { timeout: 1800000 }, async () => {
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

  test("should move a file using 'copy' then 'remove' actions", { timeout: 1800000 }, async () => {
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

  test("should delete a file using 'remove' action", { timeout: 1800000 }, async () => {
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

  test(
    "should refuse to cleanup or remove a blacklisted path (e.g. user home directory)",
    { timeout: 1800000 },
    async () => {
      sandbox = await createSandbox("fs-blacklist-e2e");
      const testPath = sandbox.path;
      const home = process.env.HOME || process.env.USERPROFILE || "";

      await expect(
        runAction(copyRunner, {
          inputs: {
            from: testPath,
            to: home,
            recursive: true,
            overwrite: true,
            cleanup: true,
          },
          sandboxPath: testPath,
        }),
      ).rejects.toThrow(/Cannot cleanup\/delete protected system or user directory/);

      await expect(
        runAction(removeRunner, {
          inputs: {
            from: home,
            recursive: true,
          },
          sandboxPath: testPath,
        }),
      ).rejects.toThrow(/Cannot cleanup\/delete protected system or user directory/);
    },
  );

  test(
    "should refuse to delete a non-empty directory if the .pipelab folder marker is missing",
    { timeout: 1800000 },
    async () => {
      sandbox = await createSandbox("fs-marker-missing-e2e");
      const testPath = sandbox.path;
      const sourceDir = join(testPath, "source");
      const targetDir = join(testPath, "target");

      await mkdir(sourceDir, { recursive: true });
      await mkdir(targetDir, { recursive: true });

      // Seed files
      await writeFile(join(sourceDir, "file1.txt"), "source file");
      await writeFile(join(targetDir, "personal_photo.png"), "important user file");

      await expect(
        runAction(copyRunner, {
          inputs: {
            from: sourceDir,
            to: targetDir,
            recursive: true,
            overwrite: true,
            cleanup: true,
          },
          sandboxPath: testPath,
        }),
      ).rejects.toThrow(/Directory is not empty and was not created by Pipelab/);
    },
  );

  test(
    "should allow cleanup and overwrite if the directory has the .pipelab folder marker",
    { timeout: 1800000 },
    async () => {
      sandbox = await createSandbox("fs-marker-present-e2e");
      const testPath = sandbox.path;
      const sourceDir = join(testPath, "source");
      const targetDir = join(testPath, "target");

      await mkdir(sourceDir, { recursive: true });
      await mkdir(targetDir, { recursive: true });

      await writeFile(join(sourceDir, "file1.txt"), "source content");

      // Run 1: Copy to target (this should create the marker)
      await runAction(copyRunner, {
        inputs: {
          from: sourceDir,
          to: targetDir,
          recursive: true,
          overwrite: true,
          cleanup: false,
        },
        sandboxPath: testPath,
      });

      // Check that .pipelab directory was created
      const markerPath = join(targetDir, ".pipelab");
      await expect(access(markerPath)).resolves.not.toThrow();

      // Run 2: Copy again with cleanup = true (should succeed because marker exists)
      await expect(
        runAction(copyRunner, {
          inputs: {
            from: sourceDir,
            to: targetDir,
            recursive: true,
            overwrite: true,
            cleanup: true,
          },
          sandboxPath: testPath,
        }),
      ).resolves.not.toThrow();

      // Verify copy succeeded
      const copiedFile = join(targetDir, "file1.txt");
      await expect(access(copiedFile)).resolves.not.toThrow();
    },
  );
});
