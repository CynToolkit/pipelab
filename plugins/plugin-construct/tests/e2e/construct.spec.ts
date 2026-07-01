import { expect, test, describe, afterEach } from "vitest";
import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction } from "@pipelab/test-utils";
import { ExportActionRunner } from "../../src/export-c3p";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesPath = join(__dirname, "fixtures");

describe("End-to-End: Construct 3 Export Pipeline", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should run the full C3 export action",
    async () => {
      sandbox = await createSandbox("c3-pipeline-e2e");
      const fixtures = fixturesPath;

      // 1. Prepare inputs
      const testC3pPath = resolve(fixtures, "c3-export/test.c3p");

      const inputs = {
        file: testC3pPath,
        version: "stable",
        username: "",
        password: "",
        headless: true,
        timeout: 120,
        customProfile: undefined,
      };

      // 2. Run the action directly
      const result = await runAction(ExportActionRunner, {
        inputs,
        sandboxPath: sandbox.path,
      });

      // 3. Verification
      const outputs = result.outputs;
      expect(outputs).toBeDefined();

      expect(outputs.folder).toEqual(expect.any(String));
      expect(outputs.parentFolder).toEqual(expect.any(String));
      expect(outputs.zipFile).toEqual(expect.any(String));

      // Verify that the output files/folders actually exist
      await expect(access(outputs.folder as string)).resolves.not.toThrow();
      await expect(
        access(outputs.parentFolder as string),
      ).resolves.not.toThrow();
      await expect(access(outputs.zipFile as string)).resolves.not.toThrow();
    },
    30 * 60 * 1000,
  );

  test(
    "should copy the custom Chrome profile IndexedDB databases to the Playwright profile",
    async () => {
      sandbox = await createSandbox("c3-profile-clone-e2e");
      const fixtures = fixturesPath;

      // 1. Seed a mock custom Chrome profile with dummy Construct 3 addon databases
      const mockProfileDir = join(sandbox.path, "mock-chrome-profile");
      const sourceDbDir = join(
        mockProfileDir,
        "Default",
        "IndexedDB",
        "https_editor.construct.net_0.indexeddb.leveldb",
      );
      await mkdir(sourceDbDir, { recursive: true });
      await writeFile(
        join(sourceDbDir, "test-addon-file-clone.txt"),
        "addon-database-data",
      );

      // 2. Prepare inputs
      const testC3pPath = resolve(fixtures, "c3-export/test.c3p");

      const inputs = {
        file: testC3pPath,
        version: "stable",
        username: "",
        password: "",
        headless: true,
        timeout: 120,
        customProfile: mockProfileDir,
      };

      // 3. Run the action
      const result = await runAction(ExportActionRunner, {
        inputs,
        sandboxPath: sandbox.path,
      });

      // 4. Verification
      const outputs = result.outputs;
      expect(outputs).toBeDefined();

      // Assert that the generated folders were cloned to playwright-profile/Default/IndexedDB/
      const clonedEditorDbFile = join(
        sandbox.path,
        "playwright-profile",
        "Default",
        "IndexedDB",
        "https_editor.construct.net_0.indexeddb.leveldb",
        "test-addon-file-clone.txt",
      );

      await expect(access(clonedEditorDbFile)).resolves.not.toThrow();
      expect(await readFile(clonedEditorDbFile, "utf-8")).toBe(
        "addon-database-data",
      );
    },
    30 * 60 * 1000,
  );
});
