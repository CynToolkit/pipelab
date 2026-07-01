import { expect, test, describe, afterEach } from "vitest";
import { uploadToPokiRunner, POKI_CLI_VERSION } from "./export.js";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction } from "@pipelab/test-utils";
import { SandboxFolder } from "@pipelab/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("End-to-End: Poki Upload Action", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should upload to poki using mocked CLI",
    async () => {
      // 1. Setup Sandbox
      sandbox = await createSandbox("poki-e2e");
      const { paths } = sandbox;

      // Seed dummy input assets
      await writeFile(join(paths.input, "index.html"), "<html><body>Test</body></html>");

      // 2. Pre-seed a mock Poki CLI to avoid downloads and network issues
      // Path matches new flat fetchPackage structure
      const relativePokiBin = join(
        "user-data",
        "packages",
        "@poki/cli",
        POKI_CLI_VERSION,
        "bin",
        "index.js",
      );
      await sandbox.mockBinary(
        relativePokiBin,
        `
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(
          path.join(process.cwd(), 'mock-env.json'),
          JSON.stringify({
            XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
            LOCALAPPDATA: process.env.LOCALAPPDATA,
            argv: process.argv
          }, null, 2)
        );
        console.log('Mock Poki CLI execution');
        process.exit(0);
        `
      );
      // Pre-seed node_modules and package.json to skip installation or allow pnpm to run
      const pokiDir = join(sandbox.path, "user-data", "packages", "@poki/cli", POKI_CLI_VERSION);
      await mkdir(pokiDir, { recursive: true });
      await writeFile(
        join(pokiDir, "package.json"),
        JSON.stringify({ name: "@poki/cli", version: POKI_CLI_VERSION }),
      );
      await mkdir(join(pokiDir, "node_modules"), { recursive: true });
      await writeFile(join(pokiDir, "node_modules", ".keep"), "");

      // 3. Run Pipeline
      try {
        await runAction(uploadToPokiRunner, {
          inputs: {
            "input-folder": paths.input,
            project: "poki-game-123",
            name: "release-v1",
            notes: "E2E test notes",
          },
          sandboxPath: sandbox.path,
        });
      } catch (e: any) {
        console.error("Execution failed:", e.message);
        throw e;
      }

      // 4. Verification
      const pokiJsonPath = join(sandbox.path, "poki.json");
      console.log("pokiJsonPath test", pokiJsonPath);
      await expect(access(pokiJsonPath)).resolves.not.toThrow();

      const pokiJsonContent = JSON.parse(await readFile(pokiJsonPath, "utf-8"));
      expect(pokiJsonContent.game_id).toBe("poki-game-123");

      // Verify that the Poki CLI process was indeed run with the sandboxed thirdparty environment variables
      const mockEnvPath = join(sandbox.path, "mock-env.json");
      await expect(access(mockEnvPath)).resolves.not.toThrow();
      const mockEnv = JSON.parse(await readFile(mockEnvPath, "utf-8"));
      const expectedSandboxConfigDir = join(sandbox.path, SandboxFolder.ThirdParty);
      expect(mockEnv.XDG_CONFIG_HOME).toBe(expectedSandboxConfigDir);
      expect(mockEnv.LOCALAPPDATA).toBe(expectedSandboxConfigDir);

      // Verify command arguments
      expect(mockEnv.argv).toContain("upload");
      expect(mockEnv.argv).toContain("release-v1");
      expect(mockEnv.argv).toContain("E2E test notes");

      // Verify that the input files were copied to the dist directory
      const distHtmlPath = join(sandbox.path, "dist", "index.html");
      await expect(access(distHtmlPath)).resolves.not.toThrow();
      const htmlContent = await readFile(distHtmlPath, "utf-8");
      expect(htmlContent).toBe("<html><body>Test</body></html>");
    },
    30 * 60 * 1000,
  );

});
