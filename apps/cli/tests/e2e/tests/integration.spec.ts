import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runPipeline } from "./utils";

describe("End-to-End: Multi-Plugin Integration Test", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("integration-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test("should run a pipeline with filesystem and electron nodes", async () => {
    const projectSourcePath = join(sandbox.path, "my-app-source");
    const projectStagingPath = join(sandbox.path, "my-app-staging");
    await mkdir(projectSourcePath, { recursive: true });

    // Create initial source files
    await writeFile(
      join(projectSourcePath, "package.json"),
      JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(projectSourcePath, "index.js"), "console.log('hello integration test')");
    await writeFile(join(projectSourcePath, "index.html"), "<h1>Hello Integration</h1>");

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
        },
        {
          uid: "package-electron-app",
          name: "Package Electron App",
          type: "action",
          origin: { pluginId: "electron", nodeId: "electron:package" },
          params: {
            "input-folder": { value: JSON.stringify(projectStagingPath) },
            configuration: { value: JSON.stringify({ name: "my-app" }) },
          },
          dependsOn: ["copy-to-staging"],
        },
      ],
      projectPath: sandbox.path,
      projectName: "Integration E2E Test",
    };

    const resultJson = await runPipeline(pipeline, sandbox.path);

    // Verification
    expect(resultJson.steps["copy-to-staging"]).toBeDefined();
    expect(resultJson.steps["package-electron-app"]).toBeDefined();

    const outputs = resultJson.steps["package-electron-app"].outputs;
    expect(outputs).toBeDefined();
    expect(outputs.output).toEqual(expect.any(String));

    // Verify output exists in the dynamically generated output folder
    await expect(access(outputs.output)).resolves.not.toThrow();
  }, 600000); // 10 minutes timeout for real build
});
