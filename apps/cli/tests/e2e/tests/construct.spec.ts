import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fixturesPath, createSandbox, runPipeline } from "./utils";

describe("End-to-End: Construct 3 Export Pipeline", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("c3-pipeline-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test("should run the full C3 export pipeline", async () => {
    const fixtures = fixturesPath;
    const jsonProject = JSON.parse(await readFile(join(fixtures, "c3-export.json"), "utf-8"));

    // Adjust the path in the fixture to be absolute for the test environment
    const testC3pPath = resolve(fixtures, "c3-export/test.c3p");
    if (jsonProject.canvas?.blocks?.[0]?.params?.file) {
      jsonProject.canvas.blocks[0].params.file.value = JSON.stringify(testC3pPath);
    }

    // Set the projectPath to sandboxPath to ensure outputs go there
    jsonProject.projectPath = sandbox.path;

    const result = await runPipeline(jsonProject, sandbox.path, { cwd: sandbox.path });

    // Verification
    expect(result.steps).toBeDefined();
    const outputs = result.steps["export-construct-project"]?.outputs;
    expect(outputs).toBeDefined();

    expect(outputs.folder).toEqual(expect.any(String));
    expect(outputs.parentFolder).toEqual(expect.any(String));
    expect(outputs.zipFile).toEqual(expect.any(String));

    // Verify that the output files/folders actually exist
    await expect(access(outputs.folder)).resolves.not.toThrow();
    await expect(access(outputs.parentFolder)).resolves.not.toThrow();
    await expect(access(outputs.zipFile)).resolves.not.toThrow();
  }, 5 * 60 * 1000);
});
