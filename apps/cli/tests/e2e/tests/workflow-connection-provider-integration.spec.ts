import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox } from "@pipelab/test-utils";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { PipelabContext } from "@pipelab/core-node";
import { DEFAULT_NODE_VERSION, DEFAULT_PNPM_VERSION } from "@pipelab/constants";
import { createItchUploadTask, itchProvider } from "@pipelab/providers";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";
import { parseWorkflowConnectionOverrides } from "../../../src/commands/workflow-connection-overrides";
import { runWorkflowCommand } from "../../../src/commands/workflows";

const WORKFLOW_TASK_ID = "@pipelab/plugin-itch/itch-upload";

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

describe("CLI connection override to Itch provider integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("resolves a parsed CLI override in the runtime and passes it to the Itch task", async () => {
    sandbox = await createSandbox("cli-connection-provider-integration");
    const alias = "itch-publisher";
    const apiKey = "cli-provider-secret";
    const overrides = parseWorkflowConnectionOverrides([`${alias}.apiKey=literal:${apiKey}`]);
    const context = new PipelabContext({ userDataPath: sandbox.paths.userData });

    expect(itchProvider.release?.destinations?.map((destination) => destination.id)).toContain(
      "@pipelab/plugin-itch/destination",
    );

    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          {
            id: "publish",
            uses: WORKFLOW_TASK_ID,
            with: {
              accountConnectionId: alias,
              user: "builder",
              "input-folder": sandbox.paths.input,
              project: "game-name",
              channel: "linux",
            },
          },
        ],
      },
      {
        host: createLocalHost(sandbox.path),
        connectionOverrides: overrides,
        tasks: { [WORKFLOW_TASK_ID]: createItchUploadTask({ context }) },
      },
    );

    expect(result.status).toBe("completed");
    expect(runWithLiveLogs).toHaveBeenCalledWith(
      context.getThirdPartyPath(
        "butler",
        "LATEST",
        process.platform === "win32" ? "butler.exe" : "butler",
      ),
      ["push", sandbox.paths.input, "builder/game-name:linux", "--json"],
      expect.objectContaining({ env: expect.objectContaining({ BUTLER_API_KEY: apiKey }) }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  it("runs a standalone workflow file with separate aliases through Itch provider tasks", async () => {
    sandbox = await createSandbox("cli-file-itch-provider-integration");
    const context = new PipelabContext({ userDataPath: sandbox.paths.userData });
    const nodeDirectory = context.getThirdPartyPath("node", DEFAULT_NODE_VERSION);
    const pnpmDirectory = context.getPackagesPath("pnpm", DEFAULT_PNPM_VERSION);
    await mkdir(join(nodeDirectory, "bin"), { recursive: true });
    await mkdir(join(pnpmDirectory, "bin"), { recursive: true });
    await writeFile(
      join(nodeDirectory, process.platform === "win32" ? "node.exe" : "bin/node"),
      "mock managed node runtime",
    );
    await writeFile(join(pnpmDirectory, "bin/pnpm.cjs"), "mock managed pnpm entrypoint");
    const sourceDirectory = join(sandbox.path, "source");
    const workflowFile = join(sandbox.path, "release.json");
    await mkdir(sourceDirectory);
    await writeFile(join(sourceDirectory, "game.txt"), "game");
    const productionKey = "env:SHOULD_NOT_BE_RESOLVED";
    const archiveKey = "literal:ARCHIVE_KEY";
    vi.stubEnv("PIPELAB_ITCH_PRODUCTION_KEY", productionKey);
    vi.stubEnv("PIPELAB_ITCH_ARCHIVE_KEY", archiveKey);
    const config = {
      version: "3.1.0" as const,
      id: "portable-itch-release",
      project: "ci-project",
      name: "Portable Itch release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "./source" },
      },
      builds: [],
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-production", project: "owner/game" },
          slots: [
            {
              id: "linux",
              enabled: true,
              input: { source: true },
              config: { channel: "linux" },
            },
          ],
        },
        {
          id: "itch-archive",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-archive", project: "owner/archive" },
          slots: [
            {
              id: "archive-linux",
              enabled: true,
              input: { source: true },
              config: { channel: "archive-linux" },
            },
          ],
        },
      ],
    };
    await writeFile(workflowFile, JSON.stringify(config));
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ user: { username: "ci-user" } }), { status: 200 }),
    );

    await runWorkflowCommand(workflowFile, {
      userData: sandbox.paths.userData,
      connection: [
        "itch-production.apiKey=env:PIPELAB_ITCH_PRODUCTION_KEY",
        "itch-archive.apiKey=env:PIPELAB_ITCH_ARCHIVE_KEY",
      ],
    });

    expect(runWithLiveLogs).toHaveBeenCalledWith(
      context.getThirdPartyPath(
        "butler",
        "LATEST",
        process.platform === "win32" ? "butler.exe" : "butler",
      ),
      ["push", expect.any(String), "ci-user/owner/game:linux", "--json"],
      expect.objectContaining({ env: expect.objectContaining({ BUTLER_API_KEY: productionKey }) }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
    expect(runWithLiveLogs).toHaveBeenCalledWith(
      context.getThirdPartyPath(
        "butler",
        "LATEST",
        process.platform === "win32" ? "butler.exe" : "butler",
      ),
      ["push", expect.any(String), "ci-user/owner/archive:archive-linux", "--json"],
      expect.objectContaining({ env: expect.objectContaining({ BUTLER_API_KEY: archiveKey }) }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
  });
});
