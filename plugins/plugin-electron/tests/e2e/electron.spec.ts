import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction } from "@pipelab/test-utils";
import { getBinName } from "@pipelab/constants";
import { packageRunner } from "../../src/package";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

      // 2. Run the action directly
      const inputs = {
        "input-folder": projectToPackage,
        configuration: { name: "my-app" },
      };

      const result = await runAction(packageRunner, {
        inputs,
        sandboxPath: sandbox.path,
      });

      // 3. Verification
      const outputs = result.outputs;
      expect(outputs).toBeDefined();
      expect(outputs.output).toEqual(expect.any(String));

      // Verify output exists in the dynamically generated output folder
      await expect(access(outputs.output as string)).resolves.not.toThrow();

      // Verify and run the binary
      const platform = process.platform;
      const binName = getBinName("my-app", platform);
      const binaryPath = join(outputs.output as string, binName);

      console.log("Calculated binary path:", binaryPath);
      await expect(access(binaryPath)).resolves.not.toThrow();
    },
    5 * 60 * 1000,
  ); // 5 minutes timeout for real build
});
