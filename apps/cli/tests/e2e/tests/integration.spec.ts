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
    "executes a release source through the CLI workflow host",
    async () => {
      sandbox = await createSandbox("release-e2e");
      const { paths } = sandbox;
      const sourcePath = join(paths.input, "release-source");
      const destinationPath = join(paths.output, "release-destination");
      const configPath = join(paths.userData, "config");

      await mkdir(sourcePath, { recursive: true });
      await mkdir(configPath, { recursive: true });
      await writeFile(join(sourcePath, "index.html"), "<h1>CLI release</h1>");
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: "release-e2e",
              project: "main",
              lastModified: new Date().toISOString(),
              type: "internal-workflow",
              configName: "release-e2e",
            },
          ],
        }),
      );
      await writeFile(
        join(configPath, "release-e2e.json"),
        JSON.stringify({
          version: "3.0.0",
          id: "release-e2e",
          project: "main",
          name: "CLI release",
          source: {
            provider: "@pipelab/plugin-filesystem/folder-source",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "copy-output",
              provider: "@pipelab/plugin-filesystem/folder-destination",
              enabled: true,
              config: { outputDir: destinationPath },
              slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
            },
          ],
        }),
      );

      const resultPath = join(sandbox.path, "release-result.json");
      await runCLI([
        "workflow",
        "run",
        "release-e2e",
        "--user-data",
        paths.userData,
        "--output",
        resultPath,
      ]);

      await expect(access(join(destinationPath, "index.html"))).resolves.not.toThrow();
      await expect(access(resultPath)).resolves.not.toThrow();
    },
    30 * 60 * 1000,
  );

  test(
    "should run a pipeline with filesystem nodes",
    async () => {
      sandbox = await createSandbox("integration-e2e");

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
            origin: { pluginId: "@pipelab/plugin-filesystem", nodeId: "fs:copy" },
            params: {
              from: { value: JSON.stringify(projectSourcePath) },
              to: { value: JSON.stringify(projectStagingPath) },
              recursive: { value: JSON.stringify(true) },
              overwrite: { value: JSON.stringify(true) },
              cleanup: { value: JSON.stringify(false) },
            },
          },
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
    30 * 60 * 1000,
  );
});
