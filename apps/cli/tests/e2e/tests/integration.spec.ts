import { expect, test, describe, afterEach } from "vitest";
import { writeFile, access, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runCLI } from "@pipelab/test-utils";

describe("End-to-End: Multi-Plugin Integration Test", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should run a pipeline with filesystem nodes",
    async () => {
      sandbox = await createSandbox("integration-e2e");
      const { paths } = sandbox;

      const projectSourcePath = join(sandbox.path, "my-app-source");
      const projectStagingPath = join(sandbox.path, "my-app-staging");
      await mkdir(projectSourcePath, { recursive: true });

      // Create initial source files
      await writeFile(
        join(projectSourcePath, "package.json"),
        JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }),
      );
      await writeFile(join(projectSourcePath, "index.js"), "console.log('hello integration test')");

      const pipeline = {
        graph: [
          {
            uid: "copy-to-staging",
            name: "Copy to Staging",
            type: "action",
            origin: { pluginId: "filesystem", nodeId: "fs:copy" },
            params: {
              from: { value: JSON.stringify(projectSourcePath) },
              to: { value: JSON.stringify(projectStagingPath) },
              recursive: { value: JSON.stringify(true) },
              overwrite: { value: JSON.stringify(true) },
              cleanup: { value: JSON.stringify(false) },
            },
          }
        ],
        projectPath: sandbox.path,
        projectName: "Integration E2E Test",
      };

      const pipelineFile = join(sandbox.path, "pipeline.json");
      const resultFile = join(sandbox.path, "result.json");
      await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));

      // Run the CLI using the helper
      await runCLI(["run", pipelineFile, "--output", resultFile]);

      const resultJson = JSON.parse(await readFile(resultFile, "utf-8"));

      // Verification
      expect(resultJson.steps["copy-to-staging"]).toBeDefined();

      const outputs = resultJson.steps["copy-to-staging"].outputs;
      expect(outputs).toBeDefined();
      expect(outputs.output).toEqual(projectStagingPath);

      // Verify output exists
      await expect(access(outputs.output as string)).resolves.not.toThrow();
    },
    5 * 60 * 1000,
  );
});
