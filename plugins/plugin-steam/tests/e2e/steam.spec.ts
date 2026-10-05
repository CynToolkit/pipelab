import { expect, test, describe, afterEach, vi } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runWorkflowTask, isWindows } from "@pipelab/test-utils";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { Subprocess } from "execa";
import { createSteamUploadTask, type SteamTaskServices } from "../../src/upload-to-steam";

vi.mock("@pipelab/plugin-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/plugin-core")>();
  return {
    ...actual,
    runWithLiveLogs: vi.fn(async (...args: Parameters<typeof actual.runWithLiveLogs>) => {
      if (args[1].includes("+run_app_build")) args[4]?.onStdout?.("Authenticated");
    }),
  };
});

describe("End-to-End: Steam Integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  const servicesFor = (sandboxPath: string): SteamTaskServices => ({
    context: {
      getConnectionsPath: () => join(sandboxPath, "user-data", "config", "connections.json"),
      getThirdPartyPath: (...segments: string[]) =>
        join(sandboxPath, "user-data", "thirdparty", ...segments),
    } as unknown as PipelabContext,
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (sandbox) {
      await sandbox.remove();
    }
    vi.clearAllMocks();
  });

  test(
    "should mock a steam upload action using a single file",
    async () => {
      sandbox = await createSandbox("steam-e2e");
      // 1. Setup a cached SteamCMD launcher
      const steamCmdDir = join("user-data", "thirdparty", "steamcmd", process.platform);
      const relativeSteamCmd = join(steamCmdDir, isWindows ? "steamcmd.exe" : "steamcmd.sh");
      const mockScript = isWindows
        ? `@echo off\necho Authenticated\nexit /b 0`
        : `#!/bin/bash\necho "Authenticated"\nexit 0`;

      await sandbox.mockBinary(relativeSteamCmd, mockScript);

      const connectionsDirectory = join(sandbox.paths.userData, "config");
      await mkdir(connectionsDirectory, { recursive: true });
      await writeFile(
        join(connectionsDirectory, "connections.json"),
        JSON.stringify({
          connections: [{ id: "steam-1", email: "testuser", password: "must-not-be-used" }],
        }),
      );

      // 2. Setup a dummy single file to upload
      const uploadFolder = join(sandbox.path, "to-upload");
      await mkdir(uploadFolder, { recursive: true });
      await writeFile(join(uploadFolder, "test-file.txt"), "This is a test file for steam upload.");

      // 3. Run the action directly
      const inputs = {
        accountConnectionId: "steam-1",
        appId: "123456",
        depotId: "654321",
        description: "Test Build",
        folder: uploadFolder,
      };

      const services = servicesFor(sandbox.path);
      const result = await runWorkflowTask(createSteamUploadTask(services), {
        inputs,
        workspacePath: sandbox.path,
        services,
      });

      // 4. Verification
      const outputs = result.outputs;
      expect(outputs).toBeDefined();
      expect(outputs["script-path"]).toBeDefined();
      expect(outputs["output-folder"]).toBeDefined();
      expect(outputs["status"]).toBe("success");
      expect(runWithLiveLogs).toHaveBeenCalledTimes(2);
      const invocations = vi.mocked(runWithLiveLogs).mock.calls;
      const loginInvocation = invocations.find((call) => call[1].includes("+login"));
      const uploadInvocation = invocations.find((call) => call[1].includes("+run_app_build"));
      expect(loginInvocation?.[1]).toEqual([
        "+@ShutdownOnFailedCommand",
        "1",
        "+@NoPromptForPassword",
        "1",
        "+login",
        "testuser",
        "+quit",
      ]);
      expect(uploadInvocation?.[0]).toContain(isWindows ? "steamcmd.exe" : "steamcmd.sh");
      expect(uploadInvocation?.[1]).toEqual([
        "+@ShutdownOnFailedCommand",
        "1",
        "+@NoPromptForPassword",
        "1",
        "+login",
        "testuser",
        "+run_app_build",
        expect.any(String),
        "+quit",
      ]);
      expect(uploadInvocation?.[2]).toMatchObject({ shell: false });
      expect(JSON.stringify(invocations)).not.toContain("must-not-be-used");

      // Verify files exist
      await expect(access(outputs["script-path"] as string)).resolves.not.toThrow();
      await expect(access(outputs["output-folder"] as string)).resolves.not.toThrow();
      await expect(
        access(join(sandbox.path, "steam", "depot_build_654321.vdf")),
      ).resolves.not.toThrow();
    },
    30 * 60 * 1000,
  ); // 30 minutes timeout for real build

  test("shows an absolute interactive login command when cached login fails", async () => {
    sandbox = await createSandbox("steam-auth-cache-e2e");
    const relativeSteamCmd = join(
      "user-data",
      "thirdparty",
      "steamcmd",
      process.platform,
      isWindows ? "steamcmd.exe" : "steamcmd.sh",
    );
    await sandbox.mockBinary(
      relativeSteamCmd,
      isWindows ? "@echo off\nexit /b 0" : "#!/bin/sh\nexit 0",
    );

    const connectionsDirectory = join(sandbox.paths.userData, "config");
    await mkdir(connectionsDirectory, { recursive: true });
    await writeFile(
      join(connectionsDirectory, "connections.json"),
      JSON.stringify({
        connections: [{ id: "steam-1", email: "testuser", password: "must-not-be-used" }],
      }),
    );

    const folder = join(sandbox.path, "to-upload");
    await mkdir(folder, { recursive: true });
    const inputs = {
      accountConnectionId: "steam-1",
      appId: "123456",
      depotId: "654321",
      description: "Test Build",
      folder,
    };
    const mockProcess = { kill: vi.fn() } as unknown as Subprocess;
    vi.mocked(runWithLiveLogs).mockImplementationOnce(async (...args) => {
      args[4]?.onStdout?.("Cached credentials not found", mockProcess);
    });

    const services = servicesFor(sandbox.path);
    const result = runWorkflowTask(createSteamUploadTask(services), {
      inputs,
      workspacePath: sandbox.path,
      services,
    });
    const failure = await result.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected the Steam task to fail");
    expect(failure.message).toMatch(
      /SteamCMD could not reuse the saved login[\s\S]*steamcmd[\s\S]*\+login[\s\S]*testuser[\s\S]*\+quit/,
    );
    expect(failure.message).not.toContain("must-not-be-used");
  });
});
