import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox } from "@pipelab/test-utils";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import {
  PipelabContext,
  ReleasePersistence,
  registerWorkflowHandlers,
  useAPI,
} from "@pipelab/core-node";
import * as remote from "../../../../../packages/core-node/src/utils/remote";

vi.mock("@pipelab/plugin-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/plugin-core")>();
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return {
    ...actual,
    downloadFile: vi.fn(async (_url: string, localPath: string) =>
      fs.writeFile(localPath, "mock archive"),
    ),
    extractZip: vi.fn(async (_archivePath: string, destinationDir: string) => {
      await fs.mkdir(destinationDir, { recursive: true });
      await Promise.all(
        ["butler", "butler.exe"].map((name) =>
          fs.writeFile(path.join(destinationDir, name), "mock executable"),
        ),
      );
    }),
    runWithLiveLogs: vi.fn(async () => undefined),
  };
});

describe("Desktop workflow submission to Itch provider integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("forwards Desktop-submitted environment and Connection values through IPC into Itch", async () => {
    sandbox = await createSandbox("desktop-workflow-submission-provider-integration");
    const sourceDirectory = join(sandbox.path, "desktop-source");
    await mkdir(sourceDirectory);
    await writeFile(join(sourceDirectory, "game.txt"), "game");
    const context = new PipelabContext({ userDataPath: sandbox.paths.userData });
    const alias = "itch-desktop";
    const apiKey = "desktop-itch-secret";
    const config = {
      version: "3.1.0" as const,
      id: "desktop-release",
      project: "desktop-project",
      name: "Desktop release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_DESKTOP_SOURCE }}" },
      },
      builds: [],
      destinations: [
        {
          id: "itch-destination",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: alias, project: "owner/game" },
          slots: [
            {
              id: "linux",
              enabled: true,
              input: { source: true },
              config: { channel: "linux" },
            },
          ],
        },
      ],
    };
    await mkdir(context.getConfigPath(), { recursive: true });
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "4.0.0",
        projects: [{ id: config.project, name: "Desktop game", description: "" }],
        workflows: [],
      }),
    );
    await new ReleasePersistence(context).save(config, config.project);
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue(process.execPath);
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ user: { username: "desktop-user" } }), { status: 200 }),
      );
    const events: unknown[] = [];

    try {
      registerWorkflowHandlers(context);
      await useAPI().handlers["workflow:execute"](
        { sender: "desktop-renderer" },
        {
          value: {
            name: `workflows/${config.id}`,
            env: { PIPELAB_DESKTOP_SOURCE: sourceDirectory },
            connectionValues: { [alias]: { apiKey } },
          },
          send: async (event) => {
            events.push(event);
          },
        },
      );
    } finally {
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
      fetchMock.mockRestore();
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "end",
        data: expect.objectContaining({ type: "success" }),
      }),
    );
    expect(runWithLiveLogs).toHaveBeenCalledWith(
      context.getThirdPartyPath(
        "butler",
        "LATEST",
        process.platform === "win32" ? "butler.exe" : "butler",
      ),
      ["push", expect.any(String), "desktop-user/owner/game:linux", "--json"],
      expect.objectContaining({ env: expect.objectContaining({ BUTLER_API_KEY: apiKey }) }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
    expect(JSON.stringify(events)).not.toContain(apiKey);
  });
});
