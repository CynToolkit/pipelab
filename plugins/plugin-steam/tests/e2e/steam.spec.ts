import { expect, test, describe, afterEach } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runAction, isWindows } from "@pipelab/test-utils";
import { uploadToSteamRunner } from "../../src/upload-to-steam";

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
      // 1. Setup a cached SteamCMD launcher
      const steamCmdDir = join("user-data", "thirdparty", "steamcmd", process.platform);
      const relativeSteamCmd = join(
        steamCmdDir,
        isWindows ? "steamcmd.exe" : "steamcmd.sh",
      );
      const mockScript = isWindows
        ? `@echo off\necho Authenticated\nexit /b 0`
        : `#!/bin/bash\necho "Authenticated"\nexit 0`;

      await sandbox.mockBinary(relativeSteamCmd, mockScript);

      // 2. Setup a dummy single file to upload
      const uploadFolder = join(sandbox.path, "to-upload");
      await mkdir(uploadFolder, { recursive: true });
      await writeFile(join(uploadFolder, "test-file.txt"), "This is a test file for steam upload.");

      // 3. Run the action directly
      const inputs = {
        username: "testuser",
        password: "test-password",
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
      await expect(access(join(sandbox.path, "steam", "depot_build_654321.vdf"))).resolves.not.toThrow();
    },
    30 * 60 * 1000,
  ); // 30 minutes timeout for real build
});
