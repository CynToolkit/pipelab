import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createSandbox, runPipeline } from "./utils";

describe("End-to-End: Steam Integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeAll(async () => {
    sandbox = await createSandbox("steam-e2e");
  });

  afterAll(async () => {
    await sandbox.remove();
  });

  test("should mock a steam upload pipeline using a single file", async () => {
    // 1. Setup mock Steam SDK
    const mockSdkPath = join(sandbox.path, "mock-steam-sdk");
    let builderFolder = "builder";
    if (process.platform === "linux") {
      builderFolder += "_linux";
    } else if (process.platform === "darwin") {
      builderFolder += "_osx";
    }

    const cmdFinal = process.platform === "win32" ? "steamcmd.exe" : "steamcmd.sh";
    const steamcmdPath = join(mockSdkPath, "tools", "ContentBuilder", builderFolder, cmdFinal);

    await mkdir(dirname(steamcmdPath), { recursive: true });

    // Create the mock steamcmd script that simulates a successful login and build
    const mockScript = process.platform === "win32"
      ? `@echo off\necho Authenticated\nexit /b 0`
      : `#!/bin/bash\necho "Authenticated"\nexit 0`;

    await writeFile(steamcmdPath, mockScript);
    if (process.platform !== "win32") {
      const { chmod } = await import("node:fs/promises");
      await chmod(steamcmdPath, 0o755);

      // Necessary stub binaries for Linux/Darwin pathing in the runner
      if (process.platform === "linux") {
        const linux32Dir = join(dirname(steamcmdPath), "linux32");
        await mkdir(linux32Dir, { recursive: true });
        await writeFile(join(linux32Dir, "steamcmd"), "#!/bin/bash\nexit 0");
        await writeFile(join(linux32Dir, "steamerrorreporter"), "#!/bin/bash\nexit 0");
        await chmod(join(linux32Dir, "steamcmd"), 0o755);
        await chmod(join(linux32Dir, "steamerrorreporter"), 0o755);
      }

      if (process.platform === "darwin") {
        const steamcmdBinaryPath = join(dirname(steamcmdPath), "steamcmd");
        await writeFile(steamcmdBinaryPath, "#!/bin/bash\nexit 0");
        await chmod(steamcmdBinaryPath, 0o755);
      }
    }

    // 2. Setup a dummy single file to upload
    const uploadFolder = join(sandbox.path, "to-upload");
    await mkdir(uploadFolder, { recursive: true });
    await writeFile(join(uploadFolder, "test-file.txt"), "This is a test file for steam upload.");

    // 3. Create the pipeline
    const pipeline = {
      graph: [
        {
          uid: "steam-upload-node",
          name: "Steam Upload Node",
          type: "action",
          origin: { pluginId: "steam", nodeId: "steam-upload" },
          params: {
            sdk: { value: JSON.stringify(mockSdkPath) },
            username: { value: JSON.stringify("testuser") },
            appId: { value: JSON.stringify("123456") },
            depotId: { value: JSON.stringify("654321") },
            description: { value: JSON.stringify("Test Build") },
            folder: { value: JSON.stringify(uploadFolder) },
          },
        },
      ],
      projectPath: sandbox.path,
      projectName: "Steam Upload Mock Test",
    };

    // 4. Run the pipeline
    const resultJson = await runPipeline(pipeline, sandbox.path);

    // 5. Verification
    expect(resultJson.steps["steam-upload-node"]).toBeDefined();

    const outputs = resultJson.steps["steam-upload-node"].outputs;
    expect(outputs).toBeDefined();
    expect(outputs["script-path"]).toBeDefined();
    expect(outputs["output-folder"]).toBeDefined();
    expect(outputs["status"]).toBe("success");

    // Verify files exist
    const { access } = await import("node:fs/promises");
    await expect(access(outputs["script-path"])).resolves.not.toThrow();
    await expect(access(outputs["output-folder"])).resolves.not.toThrow();
  }, 5 * 60 * 1000); // 5 minutes timeout for real build
});
