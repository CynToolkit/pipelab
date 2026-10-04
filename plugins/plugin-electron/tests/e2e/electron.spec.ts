import { expect, test, describe, afterEach } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import { ensurePNPM, PipelabContext } from "@pipelab/core-node";
import { getBinName } from "@pipelab/constants";
import {
  electronPackageWorkflowTaskFactory,
  type ElectronWorkflowTaskServices,
} from "../../src/package-v2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("End-to-End: Electron Plugin", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should package a project using 'electron-package' node",
    async () => {
      sandbox = await createSandbox("electron-e2e");
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
        configuration: {
          name: "my-app",
        },
        arch: "" as const,
        platform: "" as const,
      };

      const context = new PipelabContext({ userDataPath: join(sandbox.path, "user-data") });
      const services = {
        context,
        executables: { node: process.execPath, pnpm: await ensurePNPM(context) },
        workflowCachePath: join(sandbox.path, "cache"),
      } satisfies ElectronWorkflowTaskServices;
      const result = await runWorkflowTask(electronPackageWorkflowTaskFactory(services), {
        inputs: {
          "input-folder": inputs["input-folder"],
          platform: process.platform,
          arch: process.arch,
          name: "my-app",
        },
        services,
        workspacePath: sandbox.path,
        artifacts: {
          "electron-build": {
            descriptor: {
              kind: "application",
              technology: "electron",
              platform:
                process.platform === "win32"
                  ? "windows"
                  : process.platform === "darwin"
                    ? "macos"
                    : "linux",
              architecture: process.arch === "arm64" ? "arm64" : "x64",
              container: "directory",
            },
          },
        },
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
    30 * 60 * 1000,
  ); // 30 minutes timeout for real build
});
