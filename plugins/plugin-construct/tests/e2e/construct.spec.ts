import { expect, test, describe, afterEach } from "vitest";
import { readFile, access } from "node:fs/promises";
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
      const jsonProject = JSON.parse(await readFile(join(fixtures, "c3-export.json"), "utf-8"));

      // 1. Prepare inputs
      const testC3pPath = resolve(fixtures, "c3-export/test.c3p");
      const blockParams = jsonProject.canvas?.blocks?.[0]?.params;
      
      const inputs = {
        file: testC3pPath,
        version: JSON.parse(blockParams?.version?.value || '"stable"'),
        type: JSON.parse(blockParams?.type?.value || '"web"'),
        // Add other required inputs from sharedParams if needed
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
      await expect(access(outputs.parentFolder as string)).resolves.not.toThrow();
      await expect(access(outputs.zipFile as string)).resolves.not.toThrow();
    },
    5 * 60 * 1000,
  );
});
