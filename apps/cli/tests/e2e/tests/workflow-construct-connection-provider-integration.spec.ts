import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox } from "@pipelab/test-utils";
import { prepareReleaseWorkflow } from "@pipelab/core-node";
import { createLocalHost, runWorkflow, type WorkflowTaskContext } from "@pipelab/workflow-runtime";
import { parseWorkflowConnectionOverrides } from "../../../src/commands/workflow-connection-overrides";

const CONSTRUCT_TASK_ID = "@pipelab/plugin-construct/export-construct-project";
describe("CLI connection override through the Construct task boundary", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("forwards CLI environment overrides to the Construct task boundary", async () => {
    sandbox = await createSandbox("cli-construct-connection-integration");
    const file = join(sandbox.path, "project.c3p");
    await writeFile(file, "test project");
    const alias = "construct-production";
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    const env = { CONSTRUCT_USERNAME: username, CONSTRUCT_PASSWORD: password };
    const overrides = parseWorkflowConnectionOverrides([
      `${alias}.username=env:CONSTRUCT_USERNAME`,
      `${alias}.password=env:CONSTRUCT_PASSWORD`,
    ]);
    const config = {
      version: "3.1.0" as const,
      id: "construct-release",
      project: "project-1",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: file, profilePath: sandbox.path, accountConnectionId: alias },
      },
      builds: [],
      destinations: [],
    };
    const prepared = prepareReleaseWorkflow(config, "1.0.0", env);
    const sourceStep = prepared.workflow.steps.find((step) => step.uses === CONSTRUCT_TASK_ID);
    const receivedConnections: Array<Readonly<Record<string, string>> | undefined> = [];
    const constructTask = vi.fn(async (task: WorkflowTaskContext) => {
      const account = task.connectionValues[alias];
      receivedConnections.push(account);
      task.log("Construct account values", account ?? {});
    });
    expect(prepared.connectionRequirements).toEqual([
      {
        alias,
        required: true,
        fields: [
          { key: "username", required: true },
          { key: "password", required: true },
        ],
        providerId: "@pipelab/plugin-construct",
        integrationName: "Construct Account",
      },
    ]);
    expect(sourceStep?.with).toMatchObject({ accountConnectionId: alias });
    expect(JSON.stringify(sourceStep?.with)).not.toContain(password);

    const result = await runWorkflow(
      { version: prepared.workflow.version, steps: sourceStep ? [sourceStep] : [] },
      {
        host: createLocalHost(sandbox.path),
        env,
        connectionOverrides: overrides,
        connectionRequirements: prepared.connectionRequirements,
        tasks: { [CONSTRUCT_TASK_ID]: constructTask },
      },
    );

    expect(result.status).toBe("completed");
    expect(constructTask).toHaveBeenCalledOnce();
    expect(receivedConnections).toEqual([{ username, password }]);
    expect(JSON.stringify(result)).not.toContain(username);
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it("fails a missing Construct CLI environment field before the provider task starts", async () => {
    sandbox = await createSandbox("cli-construct-connection-preflight");
    const alias = "construct-production";
    const overrides = parseWorkflowConnectionOverrides([
      `${alias}.username=env:CONSTRUCT_USERNAME`,
      `${alias}.password=env:CONSTRUCT_PASSWORD`,
    ]);
    const config = {
      version: "3.1.0" as const,
      id: "construct-release",
      project: "project-1",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: {
          path: join(sandbox.path, "project.c3p"),
          profilePath: sandbox.path,
          accountConnectionId: alias,
        },
      },
      builds: [],
      destinations: [],
    };
    const prepared = prepareReleaseWorkflow(config, "1.0.0", {});
    const sourceStep = prepared.workflow.steps.find((step) => step.uses === CONSTRUCT_TASK_ID);
    const constructTask = vi.fn(async (_task: WorkflowTaskContext) => undefined);

    await expect(
      runWorkflow(
        { version: prepared.workflow.version, steps: sourceStep ? [sourceStep] : [] },
        {
          host: createLocalHost(sandbox.path),
          env: {},
          connectionOverrides: overrides,
          connectionRequirements: prepared.connectionRequirements,
          tasks: { [CONSTRUCT_TASK_ID]: constructTask },
        },
      ),
    ).rejects.toThrow("Workflow environment variable is not set: CONSTRUCT_USERNAME");
    expect(constructTask).not.toHaveBeenCalled();
  });
});
