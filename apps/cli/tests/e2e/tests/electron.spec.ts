import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runPipeline } from "./utils";

describe("End-to-End: Electron Plugin", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("electron-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test("should package a project using 'electron-package' node", async () => {
    // 1. Setup a dummy project to package
    const projectToPackage = join(sandbox.path, "my-app");
    await mkdir(projectToPackage, { recursive: true });
    await writeFile(
      join(projectToPackage, "package.json"),
      JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(projectToPackage, "index.js"), "console.log('hello electron')");
    await writeFile(join(projectToPackage, "index.html"), "<h1>Hello Electron</h1>");

    // 2. Create the pipeline
    const pipeline = {
      graph: [
        {
          uid: "electron-node",
          name: "Electron Package Node",
          type: "action",
          origin: { pluginId: "electron", nodeId: "electron:package" },
          params: {
            "input-folder": { value: JSON.stringify(projectToPackage) },
            configuration: { value: JSON.stringify({ name: "my-app" }) },
          },
        },
      ],
      projectPath: sandbox.path,
      projectName: "Electron E2E Test",
    };

    const resultJson = await runPipeline(pipeline, sandbox.path);

    // 4. Verification
    expect(resultJson.steps["electron-node"]).toBeDefined();

    const outputs = resultJson.steps["electron-node"].outputs;
    expect(outputs).toBeDefined();
    expect(outputs.output).toEqual(expect.any(String));

    // Verify output exists in the dynamically generated output folder
    await expect(access(outputs.output)).resolves.not.toThrow();
  }, 600000); // 10 minutes timeout for real build
});
