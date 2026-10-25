import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import { runWithLiveLogs, type PipelabContext } from "@pipelab/plugin-core";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";
import { ensureButler } from "./ensure.js";
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

  it("rejects a local Connection ID when the runtime did not supply run-scoped values", async () => {
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

    await expect(
      runWorkflowTask(createItchUploadTask(services), {
        inputs: {
          accountConnectionId: "itch-account",
          "input-folder": sandbox.paths.input,
          project: "game-name",
          channel: "linux",
        },
        workspacePath: sandbox.path,
        services,
        signal,
      }),
    ).rejects.toThrow("Itch account Connection 'itch-account' was not resolved for this run.");

    expect(ensureButler).not.toHaveBeenCalled();
    expect(runWithLiveLogs).not.toHaveBeenCalled();
  });

  it("uses run-scoped alias fields without reading the local connection registry", async () => {
    sandbox = await createSandbox("itch-portable-connection-alias");
    const alias = "itch-publisher";
    const apiKey = "run-scoped-butler-key";
    const connectionsPath = join(sandbox.paths.userData, "config", "missing-connections.json");
    const logs: string[] = [];
    const events: unknown[] = [];
    vi.mocked(runWithLiveLogs).mockImplementationOnce(async (...args) => {
      args[4]?.onStdout?.(
        `{"type":"log","level":"info","message":"credential ${apiKey}","time":1}\n`,
        undefined as never,
      );
    });
    const services: ItchTaskServices = {
      context: {
        getConnectionsPath: () => connectionsPath,
        getNodePath: () => "/node/bin/node",
      } as unknown as PipelabContext,
    };

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
        host: createLocalHost(sandbox.path, {
          logger: {
            info: (...args) => logs.push(args.map(String).join(" ")),
            warn: (...args) => logs.push(args.map(String).join(" ")),
            error: (...args) => logs.push(args.map(String).join(" ")),
          },
        }),
        connectionValues: { [alias]: { apiKey } },
        tasks: { [WORKFLOW_TASK_ID]: createItchUploadTask(services) },
        onEvent: (event) => events.push(event),
      },
    );

    expect(result.status).toBe("completed");
    expect(runWithLiveLogs).toHaveBeenCalledWith(
      "/mock/butler",
      ["push", sandbox.paths.input, "builder/game-name:linux", "--json"],
      expect.objectContaining({ env: expect.objectContaining({ BUTLER_API_KEY: apiKey }) }),
      expect.any(Function),
      expect.objectContaining({ onStdout: expect.any(Function) }),
    );
    expect(JSON.stringify({ result, events, logs })).not.toContain(apiKey);
    expect(JSON.stringify({ result, events, logs })).toContain("[REDACTED]");
  });

  it("rejects a run-scoped alias without its required API key before Butler setup", async () => {
    sandbox = await createSandbox("itch-missing-alias-api-key");
    const alias = "itch-publisher";
    const services: ItchTaskServices = {
      context: {
        getConnectionsPath: () => join(sandbox.paths.userData, "missing-connections.json"),
        getNodePath: () => "/node/bin/node",
      } as unknown as PipelabContext,
    };

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "publish",
              uses: WORKFLOW_TASK_ID,
              with: {
                accountConnectionId: alias,
                user: "builder",
                "api-key": "stale-inline-key",
                "input-folder": sandbox.paths.input,
                project: "game-name",
                channel: "linux",
              },
            },
          ],
        },
        {
          host: createLocalHost(sandbox.path),
          connectionValues: { [alias]: { apiKey: "" } },
          tasks: { [WORKFLOW_TASK_ID]: createItchUploadTask(services) },
        },
      ),
    ).rejects.toThrow("Itch account connection has no API key");

    expect(ensureButler).not.toHaveBeenCalled();
    expect(runWithLiveLogs).not.toHaveBeenCalled();
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
      connectionValues: { "itch-account": { username: "builder", apiKey } },
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
