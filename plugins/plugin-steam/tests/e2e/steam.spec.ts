import { expect, test, describe, afterEach } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction, isWindows, isLinux, isMac } from "@pipelab/test-utils";
import { uploadToSteamRunner } from "../../src/upload-to-steam";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("End-to-End: Steam Integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should mock a steam upload action using a single file",
    async () => {
      sandbox = await createSandbox("steam-e2e");
      // 1. Setup mock Steam SDK
      const mockSdkPath = join(sandbox.path, "mock-steam-sdk");
      let builderFolder = "builder";
      if (process.platform === "linux") {
        builderFolder += "_linux";
      } else if (process.platform === "darwin") {
        builderFolder += "_osx";
      }

      const relativeSteamCmd = join(
        "mock-steam-sdk",
        "tools",
        "ContentBuilder",
        builderFolder,
        "steamcmd",
      );

      // Create the mock steamcmd script that simulates a successful login and build
      const mockScript = isWindows
        ? `@echo off\necho Authenticated\nexit /b 0`
        : `#!/bin/bash\necho "Authenticated"\nexit 0`;

      await sandbox.mockBinary(relativeSteamCmd, mockScript);

      if (isLinux) {
        const linux32Dir = join(
          "mock-steam-sdk",
          "tools",
          "ContentBuilder",
          builderFolder,
          "linux32",
        );
        await sandbox.mockBinary(join(linux32Dir, "steamcmd"), undefined, { extension: false });
        await sandbox.mockBinary(join(linux32Dir, "steamerrorreporter"), undefined, {
          extension: false,
        });
      }

      if (isMac) {
        await sandbox.mockBinary(
          join("mock-steam-sdk", "tools", "ContentBuilder", builderFolder, "steamcmd"),
          undefined,
          { extension: false },
        );
      }

      // 2. Setup a dummy single file to upload
      const uploadFolder = join(sandbox.path, "to-upload");
      await mkdir(uploadFolder, { recursive: true });
      await writeFile(join(uploadFolder, "test-file.txt"), "This is a test file for steam upload.");

      // 3. Run the action directly
      const inputs = {
        sdk: mockSdkPath,
        username: "testuser",
        appId: "123456",
        depotId: "654321",
        description: "Test Build",
        folder: uploadFolder,
      };

      const result = await runAction(uploadToSteamRunner, {
        inputs,
        sandboxPath: sandbox.path,
      });

      // 4. Verification
      const outputs = result.outputs;
      expect(outputs).toBeDefined();
      expect(outputs["script-path"]).toBeDefined();
      expect(outputs["output-folder"]).toBeDefined();
      expect(outputs["status"]).toBe("success");

      // Verify files exist
      await expect(access(outputs["script-path"] as string)).resolves.not.toThrow();
      await expect(access(outputs["output-folder"] as string)).resolves.not.toThrow();
    },
    5 * 60 * 1000,
  ); // 5 minutes timeout for real build
});
