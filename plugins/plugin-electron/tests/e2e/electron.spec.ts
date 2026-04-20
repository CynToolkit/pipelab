import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runPipeline, findProjectRoot } from "@pipelab/test-utils";
import { getBinName } from "@pipelab/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = findProjectRoot(__dirname);

describe("End-to-End: Electron Plugin", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("electron-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test(
    "should package a project using 'electron-package' node",
    async () => {
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

      const resultJson = await runPipeline(pipeline, sandbox.path, projectRoot);

      // 4. Verification
      expect(resultJson.steps["electron-node"]).toBeDefined();

      const outputs = resultJson.steps["electron-node"].outputs;
      expect(outputs).toBeDefined();
      expect(outputs.output).toEqual(expect.any(String));

      // Verify output exists in the dynamically generated output folder
      await expect(access(outputs.output)).resolves.not.toThrow();

      // Verify and run the binary
      const platform = process.platform;
      const binName = getBinName("my-app", platform);
      const binaryPath = join(outputs.output, binName);

      console.log("Calculated binary path:", binaryPath);
      await expect(access(binaryPath)).resolves.not.toThrow();

      /*
    // Run the app (smoke test)
    const { stdout, stderr } = await runElectronApp(binaryPath, { timeoutMs: 15000 });
    
    // Check for some basic output indicating it started
    // In dev mode or with logging enabled, we expect some Electron logs
    expect(stdout + stderr).not.toContain("Error: Cannot find module");
    expect(stderr).not.toContain("Error:");
    */
    },
    5 * 60 * 1000,
  ); // 5 minutes timeout for real build
});
