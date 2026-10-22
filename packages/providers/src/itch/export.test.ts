import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import { runWithLiveLogs, type PipelabContext } from "@pipelab/plugin-core";
import { createItchUploadTask, type ItchTaskServices, WORKFLOW_TASK_ID } from "./export.js";

vi.mock("./ensure.js", () => ({ ensureButler: vi.fn(async () => "/mock/butler") }));
vi.mock("@pipelab/plugin-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/plugin-core")>();
  return {
    ...actual,
    runWithLiveLogs: vi.fn(async (...args: Parameters<typeof actual.runWithLiveLogs>) => {
      args[4]?.onStdout?.(
        '{"type":"log","level":"info","message":"Upload started","time":1}\n' +
          '{"type":"progress","progress":50,"eta":10,"bps":2,"time":1736873335}\n',
        undefined as never,
      );
    }),
  };
});

describe("Itch native upload task", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    vi.clearAllMocks();
    if (sandbox) await sandbox.remove();
  });

  it("resolves connected credentials and streams Butler output through workflow-runtime", async () => {
    sandbox = await createSandbox("itch-native-task");
    const connectionsPath = join(sandbox.paths.userData, "config", "connections.json");
    await mkdir(dirname(connectionsPath), { recursive: true });
    await writeFile(
      connectionsPath,
      JSON.stringify({
        connections: [{ id: "itch-account", username: "builder", apiKey: "butler-key" }],
      }),
    );
    const signal = new AbortController().signal;
    const services: ItchTaskServices = {
      context: {
        getConnectionsPath: () => connectionsPath,
        getNodePath: () => "/node/bin/node",
      } as unknown as PipelabContext,
    };

    const result = await runWorkflowTask(createItchUploadTask(services), {
      inputs: {
        accountConnectionId: "itch-account",
        "input-folder": sandbox.paths.input,
        project: "game-name",
        channel: "linux",
      },
      workspacePath: sandbox.path,
      services,
      signal,
    });

    expect(WORKFLOW_TASK_ID).toBe("@pipelab/plugin-itch/itch-upload");
    expect(result.result.steps.task.status).toBe("completed");
    expect(result.logs).toContain("Upload started");
    expect(result.logs).toContain("50% - ETA: 10s");
    expect(runWithLiveLogs).toHaveBeenCalledWith(
      "/mock/butler",
      ["push", sandbox.paths.input, "builder/game-name:linux", "--json"],
      expect.objectContaining({
        cancelSignal: signal,
        env: expect.objectContaining({
          BUTLER_API_KEY: "butler-key",
          PATH: expect.stringContaining(dirname("/node/bin/node")),
        }),
      }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
  });

  it("redacts the connected API key from Butler output and errors", async () => {
    sandbox = await createSandbox("itch-credential-redaction");
    const apiKey = "butler-private-key";
    const connectionsPath = join(sandbox.paths.userData, "config", "connections.json");
    const logged: string[] = [];
    await mkdir(dirname(connectionsPath), { recursive: true });
    await writeFile(
      connectionsPath,
      JSON.stringify({
        connections: [{ id: "itch-account", username: "builder", apiKey }],
      }),
    );
    vi.mocked(runWithLiveLogs).mockImplementationOnce(async (...args) => {
      args[4]?.onStdout?.(
        `{"type":"log","level":"info","message":"Invalid API key ${apiKey}","time":1}\n`,
        undefined as never,
      );
      throw new Error(`Butler failed with credential ${apiKey}`);
    });
    const services: ItchTaskServices = {
      context: {
        getConnectionsPath: () => connectionsPath,
        getNodePath: () => "/node/bin/node",
      } as unknown as PipelabContext,
    };

    const failure = await runWorkflowTask(createItchUploadTask(services), {
      inputs: {
        accountConnectionId: "itch-account",
        "input-folder": sandbox.paths.input,
        project: "game-name",
        channel: "linux",
      },
      workspacePath: sandbox.path,
      services,
      host: {
        logger: {
          info: (...args) => logged.push(args.map(String).join(" ")),
          warn: (...args) => logged.push(args.map(String).join(" ")),
          error: (...args) => logged.push(args.map(String).join(" ")),
        },
      },
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(apiKey);
    expect(logged.join(" ")).not.toContain(apiKey);
    expect(logged.join(" ")).toContain("[REDACTED]");
  });
});
