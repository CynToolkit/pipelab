import { expect, test, describe, afterEach, vi } from "vitest";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runWorkflowTask, isWindows } from "@pipelab/test-utils";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";
import type { Subprocess } from "execa";
import { createSteamUploadTask, type SteamTaskServices } from "../../upload-to-steam";

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
    "rejects a local Connection ID when the runtime did not supply run-scoped values",
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
      await expect(
        runWorkflowTask(createSteamUploadTask(services), {
          inputs,
          workspacePath: sandbox.path,
          services,
        }),
      ).rejects.toThrow("Steam account Connection 'steam-1' was not resolved for this run.");

      expect(runWithLiveLogs).not.toHaveBeenCalled();
    },
    30 * 60 * 1000,
  ); // 30 minutes timeout for real build

  test("uses a run-scoped alias username without reading the local connection registry", async () => {
    sandbox = await createSandbox("steam-portable-connection-alias");
    const steamCmdDir = join("user-data", "thirdparty", "steamcmd", process.platform);
    const relativeSteamCmd = join(steamCmdDir, isWindows ? "steamcmd.exe" : "steamcmd.sh");
    const mockScript = isWindows
      ? `@echo off\necho Authenticated\nexit /b 0`
      : `#!/bin/bash\necho "Authenticated"\nexit 0`;
    await sandbox.mockBinary(relativeSteamCmd, mockScript);

    const folder = join(sandbox.path, "portable-upload");
    await mkdir(folder, { recursive: true });
    const alias = "steam-release";
    const services = servicesFor(sandbox.path);
    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          {
            id: "publish",
            uses: "@pipelab/plugin-steam/steam-upload",
            with: {
              accountConnectionId: alias,
              appId: "123456",
              depotId: "654321",
              description: "Portable alias upload",
              folder,
            },
          },
        ],
      },
      {
        host: createLocalHost(sandbox.path),
        connectionValues: { [alias]: { username: "portable-user" } },
        tasks: {
          "@pipelab/plugin-steam/steam-upload": createSteamUploadTask(services),
        },
      },
    );

    expect(result.status).toBe("completed");
    const loginInvocation = vi
      .mocked(runWithLiveLogs)
      .mock.calls.find((call) => call[1].includes("+login"));
    expect(loginInvocation?.[1]).toEqual([
      "+@ShutdownOnFailedCommand",
      "1",
      "+@NoPromptForPassword",
      "1",
      "+login",
      "portable-user",
      "+quit",
    ]);
    await expect(access(services.context.getConnectionsPath())).rejects.toThrow();
  });

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
      connectionValues: { "steam-1": { username: "testuser" } },
      workspacePath: sandbox.path,
      services,
    });
    const failure = await result.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected the Steam task to fail");
    expect(failure.message).toMatch(
      /SteamCMD could not reuse the saved login[\s\S]*steamcmd[\s\S]*\+login[\s\S]*\[REDACTED\][\s\S]*\+quit/,
    );
    expect(failure.message).not.toContain("testuser");
    expect(failure.message).not.toContain("must-not-be-used");
  });
});
