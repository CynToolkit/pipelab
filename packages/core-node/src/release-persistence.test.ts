import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createReleaseConfig } from "@pipelab/shared";
import type { Workflow, WorkflowResult } from "@pipelab/workflow-runtime";
import * as workflowRuntime from "@pipelab/workflow-runtime";
import { PipelabContext } from "./context";
import { ReleasePersistence } from "./release-persistence";
import { writeJsonFileAtomically } from "./utils/atomic-json";
import {
  executeWorkflow,
  prepareReleaseWorkflow,
  registerWorkflowHandlers,
} from "./handlers/workflow";
import { useAPI } from "./ipc-core";
import { saveStrictConnections, saveStrictProjects } from "./strict-config-persistence";
import * as remote from "./utils/remote";
import { BuildHistoryStorage } from "./handlers/build-history";

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-release-persistence-"));
  const context = new PipelabContext({ userDataPath: root });
  await mkdir(context.getConfigPath(), { recursive: true });
  await writeFile(
    context.getProjectsPath(),
    JSON.stringify({
      version: "4.0.0",
      projects: [{ id: "project-1", name: "Project", description: "" }],
      workflows: [
        {
          id: "workflow-1",
          project: "project-1",
          lastModified: "2026-01-01T00:00:00.000Z",
          type: "internal-workflow",
          configName: "workflows/workflow-1",
        },
      ],
    }),
  );
  return { context, persistence: new ReleasePersistence(context) };
};

describe("ReleasePersistence", () => {
  it.each(["Node.js", "pnpm"])("persists a terminal run when %s setup fails", async (runtime) => {
    const { context } = await setup();
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: context.getConfigPath() },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    (runtime === "Node.js" ? nodeSetup : pnpmSetup).mockRejectedValue(
      new Error(`${runtime} setup failed`),
    );
    let runId = "";
    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          onRunCreated: (id) => {
            runId = id;
          },
        }),
      ).rejects.toThrow(`${runtime} setup failed`);
      const history = await new BuildHistoryStorage(context).get(runId, "project-1");
      expect(history).toMatchObject({
        status: "failed",
        error: { message: `${runtime} setup failed` },
        completedSteps: 0,
        failedSteps: 0,
      });
      expect(history?.steps.every((step) => step.status === "pending")).toBe(true);
    } finally {
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("preflights missing workflow environment before creating history or preparing runtimes", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_REQUIRED_SOURCE_PATH_FOR_PREFLIGHT";
    const previousValue = process.env[variableName];
    delete process.env[variableName];
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_REQUIRED_SOURCE_PATH_FOR_PREFLIGHT }}" },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    let runCreated = false;

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          onRunCreated: () => {
            runCreated = true;
          },
        }),
      ).rejects.toThrow(
        "Workflow environment variable is not set: PIPELAB_REQUIRED_SOURCE_PATH_FOR_PREFLIGHT",
      );

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(runCreated).toBe(false);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
    } finally {
      if (previousValue === undefined) delete process.env[variableName];
      else process.env[variableName] = previousValue;
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("executes an imported Release Workflow config without loading it from the saved index", async () => {
    const { context } = await setup();
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Imported workflow",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: context.getConfigPath() },
      },
    });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue({
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {},
    });

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", { workflowConfig: config }),
      ).resolves.toMatchObject({ result: { status: "completed" } });

      expect(workflowRun).toHaveBeenCalledOnce();
      expect(await new BuildHistoryStorage(context).getAll()).toHaveLength(1);
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("preflights empty required release environment values before creating history", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_EMPTY_REQUIRED_SOURCE_PATH_FOR_PREFLIGHT";
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: `\${{ env.${variableName} }}` },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue({
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {},
    });
    let runCreated = false;

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          env: { [variableName]: "" },
          onRunCreated: () => {
            runCreated = true;
          },
        }),
      ).rejects.toThrow(`Workflow environment variable is empty: ${variableName}`);

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(runCreated).toBe(false);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
      expect(workflowRun).not.toHaveBeenCalled();
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("preflights incomplete provider Connections before creating history", async () => {
    const { context } = await setup();
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: {
          provider: "@pipelab/core/source/folder",
          config: { path: context.getConfigPath() },
        },
      }),
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-production", project: "pipelab/game" },
          slots: [{ id: "windows", enabled: true, config: { channel: "windows" } }],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue({
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {},
    });
    let runCreated = false;

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          connectionValues: { "itch-production": {} },
          onRunCreated: () => {
            runCreated = true;
          },
        }),
      ).rejects.toThrow("Required workflow Connection field is missing: itch-production.apiKey");

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(runCreated).toBe(false);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
      expect(workflowRun).not.toHaveBeenCalled();
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  const constructAccountCases: Array<{
    values: Record<string, string>;
    field: "username" | "password";
  }> = [
    { values: {}, field: "username" },
    { values: { username: "construct-user@example.test" }, field: "password" },
  ];

  it("preflights a configured optional Construct account alias before creating history", async () => {
    const { context } = await setup();
    const alias = "construct-production";
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: {
          path: join(context.userDataPath, "project.c3p"),
          profilePath: join(context.userDataPath, "profile"),
          accountConnectionId: alias,
          version: "",
        },
      },
    });
    await writeFile(join(context.userDataPath, "project.c3p"), "fixture");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue({
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {},
    });

    try {
      await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
        `Required workflow Connection alias is missing: ${alias}`,
      );

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
      expect(workflowRun).not.toHaveBeenCalled();
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it.each(constructAccountCases)(
    "preflights a missing Construct Account $field before creating history",
    async (scenario) => {
    const { context } = await setup();
    const alias = "construct-production";
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: {
          path: join(context.userDataPath, "project.c3p"),
          profilePath: join(context.userDataPath, "profile"),
          accountConnectionId: alias,
          version: "",
        },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue({
      status: "completed",
      outputs: {},
      artifacts: [],
      deliveries: [],
      steps: {},
    });
    let runCreated = false;

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          connectionValues: { [alias]: scenario.values },
          onRunCreated: () => {
            runCreated = true;
          },
        }),
      ).rejects.toThrow(
        `Required workflow Connection field is missing: ${alias}.${scenario.field}`,
      );

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(runCreated).toBe(false);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
      expect(workflowRun).not.toHaveBeenCalled();
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
    },
  );

  it("passes saved provider fields for legacy local Connection IDs into the run scope", async () => {
    const { context } = await setup();
    const legacyApiKey = "legacy-local-itch-api-key";
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Legacy release",
        source: {
          provider: "@pipelab/core/source/folder",
          config: { path: context.getConfigPath() },
        },
      }),
      version: "3.0.0",
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "legacy-itch-id", project: "pipelab/game" },
          slots: [{ id: "windows", enabled: true, config: { channel: "windows" } }],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      join(context.getConfigPath("workflows"), "workflow-1.json"),
      JSON.stringify(config),
    );
    await saveStrictConnections(context, {
      version: "1.0.0",
      connections: [
        {
          id: "legacy-itch-id",
          pluginName: "@pipelab/plugin-itch",
          integrationName: "Itch Butler Account",
          name: "Legacy Itch account",
          createdAt: "2020-01-01T00:00:00.000Z",
          isDefault: false,
          apiKey: legacyApiKey,
        },
      ],
    });

    let receivedValues: unknown;
    const workflowRun = vi
      .spyOn(workflowRuntime, "runWorkflow")
      .mockImplementation(async (_workflow, runContext) => {
        receivedValues = runContext.connectionValues;
        throw new Error("stop after runtime contract capture");
      });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
        "stop after runtime contract capture",
      );

      expect(receivedValues).toEqual({ "legacy-itch-id": { apiKey: legacyApiKey } });
      expect(JSON.stringify(await new BuildHistoryStorage(context).getAll())).not.toContain(
        legacyApiKey,
      );
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("normalizes a legacy Steam email field to the provider's username field", async () => {
    const { context } = await setup();
    const legacyUsername = "legacy-steam-user";
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Legacy Steam release",
        source: {
          provider: "@pipelab/core/source/web-folder",
          config: { path: context.getConfigPath() },
        },
      }),
      version: "3.0.0",
      builds: [
        {
          id: "electron",
          type: "desktop",
          engine: "@pipelab/plugin-electron/producer",
          enabled: true,
          config: {},
          targets: [{ id: "windows-x64", enabled: true, config: {} }],
        },
      ],
      destinations: [
        {
          id: "steam-production",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: {
            accountConnectionId: "legacy-steam-id",
            appId: "12345",
            description: "Legacy build",
          },
          slots: [
            {
              id: "windows",
              enabled: true,
              input: { buildId: "electron", targetId: "windows-x64" },
              config: { depotId: "54321" },
            },
          ],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      join(context.getConfigPath("workflows"), "workflow-1.json"),
      JSON.stringify(config),
    );
    await saveStrictConnections(context, {
      version: "1.0.0",
      connections: [
        {
          id: "legacy-steam-id",
          pluginName: "@pipelab/plugin-steam",
          integrationName: "Steam Account",
          name: "Legacy Steam account",
          createdAt: "2020-01-01T00:00:00.000Z",
          isDefault: false,
          email: legacyUsername,
        },
      ],
    });

    let receivedValues: unknown;
    const workflowRun = vi
      .spyOn(workflowRuntime, "runWorkflow")
      .mockImplementation(async (_workflow, runContext) => {
        receivedValues = runContext.connectionValues;
        throw new Error("stop after runtime contract capture");
      });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
        "stop after runtime contract capture",
      );

      expect(receivedValues).toEqual({ "legacy-steam-id": { username: legacyUsername } });
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("derives active Connection schemas and required env bindings from provider definitions", () => {
    const variableName = "RELEASE_SOURCE_DIRECTORY";
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: {
          provider: "@pipelab/core/source/folder",
          config: { path: `\${{ env.${variableName} }}` },
        },
      }),
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-production", project: "pipelab/game" },
          slots: [{ id: "windows", enabled: true, config: { channel: "windows" } }],
        },
        {
          id: "disabled-steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: false,
          config: { accountConnectionId: "itch-production", appId: "123" },
          slots: [{ id: "linux", enabled: true, config: { depotId: "456" } }],
        },
      ],
    };

    const prepared = prepareReleaseWorkflow(config, "1.0.0", {
      [variableName]: "/games/current",
    });

    expect(prepared.connectionRequirements).toEqual([
      {
        alias: "itch-production",
        required: true,
        fields: [{ key: "apiKey", required: true }],
        providerId: "@pipelab/plugin-itch",
        integrationName: "Itch Butler Account",
      },
    ]);
    expect(prepared.requiredEnvironmentVariables).toEqual([variableName]);
  });

  it("compiles a Construct account alias without serializing credential values or environment references", async () => {
    const { context } = await setup();
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    vi.stubEnv("CONSTRUCT_USERNAME", "daemon-user@example.test");
    vi.stubEnv("CONSTRUCT_PASSWORD", "daemon-password-secret");
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: {
          path: join(context.userDataPath, "project.c3p"),
          profilePath: join(context.userDataPath, "profile"),
          accountConnectionId: "construct-production",
          version: "",
        },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    let compiled: Workflow | undefined;
    const workflowRun = vi
      .spyOn(workflowRuntime, "runWorkflow")
      .mockImplementation(async (workflow) => {
        compiled = workflow;
        throw new Error("stop after compile");
      });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          env: {},
          connectionValues: { "construct-production": { username, password } },
        }),
      ).rejects.toThrow("stop after compile");

      expect(compiled?.steps[0]?.with).toMatchObject({
        accountConnectionId: "construct-production",
      });
      expect(compiled?.steps[0]?.with).not.toHaveProperty("username");
      expect(compiled?.steps[0]?.with).not.toHaveProperty("password");
      expect(JSON.stringify(compiled)).not.toContain(username);
      expect(JSON.stringify(compiled)).not.toContain(password);
      expect(JSON.stringify(compiled)).not.toContain("CONSTRUCT_USERNAME");
      expect(JSON.stringify(compiled)).not.toContain("CONSTRUCT_PASSWORD");
    } finally {
      vi.unstubAllEnvs();
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("preflights missing connection override environment before creating history", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_REQUIRED_CONNECTION_VALUE_FOR_PREFLIGHT";
    const previousValue = process.env[variableName];
    delete process.env[variableName];
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: context.getConfigPath() },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    let runCreated = false;

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          env: {},
          connectionOverrides: [
            {
              alias: "steam-release",
              field: "password",
              value: { kind: "environment", name: variableName },
            },
          ],
          onRunCreated: () => {
            runCreated = true;
          },
        }),
      ).rejects.toThrow(`Workflow environment variable is not set: ${variableName}`);

      expect(await new BuildHistoryStorage(context).getAll()).toEqual([]);
      expect(runCreated).toBe(false);
      expect(nodeSetup).not.toHaveBeenCalled();
      expect(pnpmSetup).not.toHaveBeenCalled();
    } finally {
      if (previousValue === undefined) delete process.env[variableName];
      else process.env[variableName] = previousValue;
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("passes a single resolved Connection snapshot to the shared runtime", async () => {
    const { context } = await setup();
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: {
          provider: "@pipelab/core/source/folder",
          config: { path: context.getConfigPath() },
        },
      }),
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-production", project: "pipelab/game" },
          slots: [{ id: "windows", enabled: true, config: { channel: "windows" } }],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const connectionValues = { "itch-production": { apiKey: "saved-account" } };
    const received: { values?: unknown; overrides?: unknown } = {};
    const workflowRun = vi
      .spyOn(workflowRuntime, "runWorkflow")
      .mockImplementation(async (_workflow, runContext) => {
        received.values = runContext.connectionValues;
        received.overrides = runContext.connectionOverrides;
        throw new Error("stop after runtime contract capture");
      });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockImplementation(async () => {
      connectionValues["itch-production"].apiKey = "changed during setup";
      return "node";
    });
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          connectionValues,
        }),
      ).rejects.toThrow("stop after runtime contract capture");

      expect(received).toEqual({
        values: { "itch-production": { apiKey: "saved-account" } },
        overrides: undefined,
      });
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("uses environment values supplied by the workflow initiator", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_CLIENT_SOURCE_PATH";
    const previousValue = process.env[variableName];
    delete process.env[variableName];
    const sourcePath = join(context.userDataPath, "client-source");
    const changedSourcePath = join(context.userDataPath, "changed-client-source");
    await mkdir(sourcePath, { recursive: true });
    await writeFile(join(sourcePath, "marker.txt"), "provided by the client");
    await mkdir(changedSourcePath, { recursive: true });
    await writeFile(join(changedSourcePath, "marker.txt"), "changed during runtime setup");
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_CLIENT_SOURCE_PATH }}" },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const environment = { [variableName]: sourcePath };
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockImplementation(async () => {
      environment[variableName] = changedSourcePath;
      return "node";
    });
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      const run = await executeWorkflow(context, "workflows/workflow-1", {
        env: environment,
      });

      expect(run.result.status).toBe("completed");
      await expect(
        readFile(
          join(context.getArtifactsPath("workflow", run.runId), "source", "marker.txt"),
          "utf8",
        ),
      ).resolves.toBe("provided by the client");
    } finally {
      if (previousValue === undefined) delete process.env[variableName];
      else process.env[variableName] = previousValue;
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("forwards the initiating environment through workflow execution IPC", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_IPC_SOURCE_PATH";
    const previousValue = process.env[variableName];
    delete process.env[variableName];
    const sourcePath = join(context.userDataPath, "ipc-client-source");
    await mkdir(sourcePath, { recursive: true });
    await writeFile(join(sourcePath, "marker.txt"), "provided over IPC");
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_IPC_SOURCE_PATH }}" },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      registerWorkflowHandlers(context);
      const handler = useAPI().handlers["workflow:execute"];
      const sentEvents: unknown[] = [];
      await handler(
        { sender: "test" },
        {
          value: {
            name: "workflows/workflow-1",
            env: { [variableName]: sourcePath },
          },
          send: async (events) => {
            sentEvents.push(events);
          },
        },
      );

      const completed = sentEvents.find(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "end" &&
          "data" in event &&
          typeof event.data === "object" &&
          event.data !== null &&
          "type" in event.data &&
          event.data.type === "success",
      );
      expect(completed).toBeDefined();
      const run = await new BuildHistoryStorage(context).getAll();
      expect(run).toHaveLength(1);
      await expect(
        readFile(
          join(context.getArtifactsPath("workflow", run[0]!.id), "source", "marker.txt"),
          "utf8",
        ),
      ).resolves.toBe("provided over IPC");
    } finally {
      if (previousValue === undefined) delete process.env[variableName];
      else process.env[variableName] = previousValue;
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("forwards run-scoped connection overrides through IPC without exposing them", async () => {
    const { context } = await setup();
    const sourcePath = join(context.userDataPath, "ipc-connection-source");
    const secret = "ipc-local-connection-secret";
    const connectionOverrides = [
      {
        alias: "itch",
        field: "apiKey",
        value: { kind: "environment" as const, name: "IPC_ITCH_API_KEY" },
      },
    ];
    let receivedValues: unknown;
    let providerReceivedApiKey: unknown;
    await mkdir(sourcePath, { recursive: true });
    await writeFile(join(sourcePath, "marker.txt"), "copied with connection value");
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: { provider: "@pipelab/core/source/folder", config: { path: sourcePath } },
      }),
      destinations: [
        {
          id: "itch-production",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch", project: "pipelab/game" },
          slots: [{ id: "windows", enabled: true, config: { channel: "windows" } }],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));

    const releaseTask = prepareReleaseWorkflow(config).workflow.steps.find((step) => step.delivery);
    if (!releaseTask) throw new Error("Expected the Itch release task to compile.");
    const originalRunWorkflow = workflowRuntime.runWorkflow;
    const workflowRun = vi
      .spyOn(workflowRuntime, "runWorkflow")
      .mockImplementation(async (workflow, runContext) => {
        receivedValues = runContext.connectionValues;
        return originalRunWorkflow(workflow, {
          ...runContext,
          tasks: {
            ...runContext.tasks,
            [releaseTask.uses]: async ({ connectionValues }) => {
              providerReceivedApiKey = connectionValues.itch?.apiKey;
              return { apiKey: connectionValues.itch?.apiKey ?? "" };
            },
          },
        });
      });
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");
    registerWorkflowHandlers(context);
    const handler = useAPI().handlers["workflow:execute"];
    const sentEvents: unknown[] = [];

    try {
      await handler(
        { sender: "test" },
        {
          value: {
            name: "workflows/workflow-1",
            env: { IPC_ITCH_API_KEY: secret },
            connectionOverrides,
          },
          send: async (events) => {
            sentEvents.push(events);
          },
        },
      );

      expect(receivedValues).toEqual({
        itch: { apiKey: secret },
      });
      expect(providerReceivedApiKey).toBe(secret);
      expect(JSON.stringify(sentEvents)).not.toContain(secret);
      expect(JSON.stringify(await new BuildHistoryStorage(context).getAll())).not.toContain(secret);
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("redacts environment values from persisted artifact paths", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_ARTIFACT_PATH_SECRET";
    const secretPath = "/private/path-with-sensitive-value";
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_ARTIFACT_PATH_SECRET }}" },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    const artifact = { name: "published", path: secretPath };
    const result = {
      status: "completed",
      outputs: { publish: { path: secretPath } },
      artifacts: [artifact],
      deliveries: [],
      steps: {
        publish: {
          id: "publish",
          uses: "test:publish",
          status: "completed",
          outputs: { path: secretPath },
          artifacts: [artifact],
          startedAt: 0,
          completedAt: 1,
          duration: 1,
        },
      },
    } satisfies WorkflowResult;
    const workflowRun = vi.spyOn(workflowRuntime, "runWorkflow").mockResolvedValue(result);
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockResolvedValue("node");
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      const run = await executeWorkflow(context, "workflows/workflow-1", {
        env: { [variableName]: secretPath },
      });

      expect(run.result.artifacts[0]?.path).toBe(secretPath);
      registerWorkflowHandlers(context);
      const handler = useAPI().handlers["workflow:execute"];
      const sentEvents: unknown[] = [];
      await handler(
        { sender: "test" },
        {
          value: {
            name: "workflows/workflow-1",
            env: { [variableName]: secretPath },
          },
          send: async (events) => {
            sentEvents.push(events);
          },
        },
      );
      expect(JSON.stringify(sentEvents)).not.toContain(secretPath);

      const history = await new BuildHistoryStorage(context).getAll();
      expect(JSON.stringify(history)).not.toContain(secretPath);
      expect(history[0]?.artifacts?.[0]?.path).toBe("[REDACTED]");
    } finally {
      workflowRun.mockRestore();
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("redacts environment values from thrown error names", async () => {
    const { context } = await setup();
    const variableName = "PIPELAB_ERROR_NAME_SECRET";
    const secret = "private-error-name-value";
    const setupError = new Error("runtime setup failed");
    setupError.name = `Failure-${secret}`;
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: {
        provider: "@pipelab/core/source/folder",
        config: { path: "${{ env.PIPELAB_ERROR_NAME_SECRET }}" },
      },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    const nodeSetup = vi.spyOn(remote, "ensureNodeJS").mockRejectedValue(setupError);
    const pnpmSetup = vi.spyOn(remote, "ensurePNPM").mockResolvedValue("pnpm");

    try {
      await expect(
        executeWorkflow(context, "workflows/workflow-1", {
          env: { [variableName]: secret },
        }),
      ).rejects.toMatchObject({
        name: "Failure-[REDACTED]",
        message: "runtime setup failed",
      });
      const history = await new BuildHistoryStorage(context).getAll();
      expect(JSON.stringify(history)).not.toContain(secret);
    } finally {
      nodeSetup.mockRestore();
      pnpmSetup.mockRestore();
    }
  });

  it("validates persisted workflow connections without provider initialization", async () => {
    const { context } = await setup();
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: { provider: "source", config: {} },
      }),
      destinations: [
        {
          id: "steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: { accountConnectionId: "account-1", appId: "123" },
          slots: [],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    await writeFile(
      context.getConnectionsPath(),
      JSON.stringify({
        version: "1.0.0",
        connections: [
          {
            id: "account-1",
            pluginName: "@pipelab/plugin-other",
            name: "Other account",
            createdAt: "2026-01-01",
            isDefault: false,
          },
        ],
      }),
    );

    const load = new ReleasePersistence(context).loadWithProject("workflow-1", "project-1");
    await expect(load).rejects.toThrow("does not belong to integration '@pipelab/plugin-steam'");
  });

  it("rejects malformed connection references before workflow execution starts", async () => {
    const { context, persistence } = await setup();
    const config = {
      ...createReleaseConfig({
        id: "workflow-1",
        project: "project-1",
        name: "Release",
        source: { provider: "source", config: {} },
      }),
      destinations: [
        {
          id: "steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: { accountConnectionId: "deleted.connection", appId: "123" },
          slots: [],
        },
      ],
    };
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(context.getConfigPath("workflows", "workflow-1.json"), JSON.stringify(config));
    await writeFile(
      context.getConnectionsPath(),
      JSON.stringify({ version: "1.0.0", connections: [] }),
    );

    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "Connection 'deleted.connection' does not exist.",
    );
    await writeFile(
      context.getConnectionsPath(),
      JSON.stringify({
        version: "1.0.0",
        connections: [
          {
            id: "deleted.connection",
            pluginName: "@pipelab/plugin-other",
            name: "Other account",
            createdAt: "2026-01-01",
            isDefault: false,
          },
        ],
      }),
    );
    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "does not belong to integration '@pipelab/plugin-steam'",
    );
    await expect(persistence.load("workflow-1")).resolves.toMatchObject({ id: "workflow-1" });
  });

  it("does not create a missing workflow while loading", async () => {
    const { context, persistence } = await setup();
    await expect(persistence.load("workflow-1")).rejects.toThrow("file is missing");
    await expect(stat(context.getConfigPath("workflows", "workflow-1.json"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  it("loads and atomically saves a canonical workflow", async () => {
    const { context, persistence } = await setup();
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: { path: "project" } },
    });
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, JSON.stringify(config));
    await expect(persistence.load("workflow-1", "project-1")).resolves.toEqual(config);
    const updated = { ...config, name: "Updated" };
    await persistence.save(updated, "project-1");
    await expect(readFile(workflowPath, "utf8")).resolves.toContain('"name": "Updated"');
  });

  it("preserves both concurrently-created workflow index entries", async () => {
    const { context } = await setup();
    const delayedWriter = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath())
        await new Promise((resolve) => setTimeout(resolve, 20));
      await writeJsonFileAtomically(filePath, value);
    };
    const first = new ReleasePersistence(context, delayedWriter);
    const second = new ReleasePersistence(context, delayedWriter);
    const config = (id: string) =>
      createReleaseConfig({
        id,
        project: "project-1",
        name: id,
        source: { provider: "source", config: {} },
      });

    await Promise.all([first.save(config("workflow-a")), second.save(config("workflow-b"))]);

    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    const workflowIds = repo.workflows.map((workflow: { id: string }) => workflow.id).sort();
    expect(workflowIds).toEqual(["workflow-1", "workflow-a", "workflow-b"]);
  });

  it("preserves workflow index entries created by separate processes", async () => {
    const { context } = await setup();
    const sourceUrl = new URL("./release-persistence.ts", import.meta.url).href;
    const contextUrl = new URL("./context.ts", import.meta.url).href;
    const script = [
      `import { PipelabContext } from ${JSON.stringify(contextUrl)};`,
      `import { ReleasePersistence } from ${JSON.stringify(sourceUrl)};`,
      `import { createReleaseConfig } from "@pipelab/shared";`,
      `const context = new PipelabContext({ userDataPath: process.argv[1] });`,
      `const id = process.argv[2];`,
      `const config = createReleaseConfig({ id, project: "project-1", name: id, source: { provider: "source", config: {} } });`,
      `await new ReleasePersistence(context).save(config, "project-1");`,
    ].join("\n");
    const run = (id: string) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx/esm", "--input-type=module", "-e", script, context.userDataPath, id],
          { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
        );
        let stderr = "";
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Persistence child failed (${code}): ${stderr}`)),
        );
      });

    await Promise.all([run("workflow-a"), run("workflow-b")]);
    const index = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(index.workflows.map((workflow: { id: string }) => workflow.id).sort()).toEqual([
      "workflow-1",
      "workflow-a",
      "workflow-b",
    ]);
  }, 30_000);

  it("serializes a workflow save racing with delete without stale index state", async () => {
    const { context } = await setup();
    const persistence = new ReleasePersistence(context);
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      workflowPath,
      JSON.stringify(
        createReleaseConfig({
          id: "workflow-1",
          project: "project-1",
          name: "Existing",
          source: { provider: "source", config: {} },
        }),
      ),
    );
    const newConfig = createReleaseConfig({
      id: "workflow-a",
      project: "project-1",
      name: "New",
      source: { provider: "source", config: {} },
    });

    await Promise.all([persistence.save(newConfig), persistence.delete("workflow-1")]);

    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows.map((workflow: { id: string }) => workflow.id)).toContain("workflow-a");
    expect(repo.workflows.map((workflow: { id: string }) => workflow.id)).not.toContain(
      "workflow-1",
    );
    await expect(stat(workflowPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(context.getConfigPath("workflows", "workflow-a.json")),
    ).resolves.toBeDefined();
  });

  it("keeps workflow state consistent when a project save races with creation", async () => {
    const { context } = await setup();
    const persistence = new ReleasePersistence(context);
    const current = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    const config = createReleaseConfig({
      id: "workflow-a",
      project: "project-1",
      name: "New",
      source: { provider: "source", config: {} },
    });

    await Promise.allSettled([
      persistence.save(config),
      saveStrictProjects(context, {
        ...current,
        projects: [{ ...current.projects[0], name: "Renamed" }],
      }),
    ]);

    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    const workflowFile = context.getConfigPath("workflows", "workflow-a.json");
    const workflowExists = await stat(workflowFile)
      .then(() => true)
      .catch(() => false);
    expect(repo.workflows.some((workflow: { id: string }) => workflow.id === "workflow-a")).toBe(
      workflowExists,
    );
  });

  it("does not overwrite an orphaned workflow file during creation", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "orphan.json");
    const original = JSON.stringify({ preserved: true });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, original);
    const config = createReleaseConfig({
      id: "orphan",
      project: "project-1",
      name: "Should not replace orphan",
      source: { provider: "source", config: {} },
    });

    await expect(persistence.save(config, "project-1")).rejects.toThrow("orphaned");
    await expect(readFile(workflowPath, "utf8")).resolves.toBe(original);
  });

  it("leaves malformed and mismatched workflow files untouched", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(workflowPath, "{not-json");
    await expect(persistence.load("workflow-1")).rejects.toThrow(
      /Malformed JSON|invalid persisted data/,
    );
    await expect(readFile(workflowPath, "utf8")).resolves.toBe("{not-json");

    const mismatched = createReleaseConfig({
      id: "other",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(mismatched));
    await expect(persistence.load("workflow-1")).rejects.toThrow("does not match index entry");
  });

  it("surfaces the persisted-field reason when workflow parsing fails", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      workflowPath,
      JSON.stringify({
        ...createReleaseConfig({
          id: "workflow-1",
          project: "project-1",
          name: "Release",
          source: { provider: "source", config: {} },
        }),
        description: 42,
      }),
    );

    await expect(persistence.load("workflow-1")).rejects.toThrow("description");
  });

  it("rejects a workflow whose indexed project is missing", async () => {
    const { context, persistence } = await setup();
    await writeFile(
      context.getProjectsPath(),
      JSON.stringify({
        version: "4.0.0",
        projects: [{ id: "other", name: "Other", description: "" }],
        workflows: [
          {
            id: "workflow-1",
            project: "missing",
            lastModified: "2026-01-01",
            type: "internal-workflow",
            configName: "workflows/workflow-1",
          },
        ],
      }),
    );
    await expect(persistence.load("workflow-1")).rejects.toThrow(
      /missing project|Project index is invalid/,
    );
  });

  it("rejects route and file identity mismatches", async () => {
    const { context, persistence } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Release",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    await expect(persistence.load("workflow-1", "other-project")).rejects.toThrow(
      "not 'other-project'",
    );
    await writeFile(workflowPath, JSON.stringify({ ...config, id: "other-workflow" }));
    await expect(persistence.load("workflow-1")).rejects.toThrow("does not match index entry");
  });

  it("rolls the workflow file back when updating the index fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const original = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Original",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(original));
    const writer = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath()) throw new Error("index write failed");
      await writeJsonFileAtomically(filePath, value);
    };
    const persistence = new ReleasePersistence(context, writer);
    await expect(persistence.save({ ...original, name: "Changed" }, "project-1")).rejects.toThrow(
      "Unable to update the workflow index",
    );
    const restored = JSON.parse(await readFile(workflowPath, "utf8"));
    expect(restored).toEqual(original);
  });

  it("does not restore a workflow after the index commit if tombstone cleanup fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "To delete",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    let cleanupAttempts = 0;
    const persistence = new ReleasePersistence(context, writeJsonFileAtomically, {
      rename,
      rm: async (path, options) => {
        if (String(path).includes(".deleting-") && cleanupAttempts++ === 0)
          throw new Error("tombstone cleanup failed");
        return rm(path, options);
      },
    });

    await expect(persistence.delete("workflow-1")).resolves.toBeUndefined();
    await expect(stat(workflowPath)).rejects.toMatchObject({ code: "ENOENT" });
    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows).toEqual([]);
  });

  it("restores the workflow file when delete index mutation fails", async () => {
    const { context } = await setup();
    const workflowPath = context.getConfigPath("workflows", "workflow-1.json");
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    const config = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "To preserve",
      source: { provider: "source", config: {} },
    });
    await writeFile(workflowPath, JSON.stringify(config));
    const writer = async (filePath: string, value: unknown) => {
      if (filePath === context.getProjectsPath()) throw new Error("index write failed");
      await writeJsonFileAtomically(filePath, value);
    };
    const persistence = new ReleasePersistence(context, writer);

    await expect(persistence.delete("workflow-1")).rejects.toThrow("Unable to delete workflow");
    await expect(readFile(workflowPath, "utf8")).resolves.toBe(JSON.stringify(config));
    const repo = JSON.parse(await readFile(context.getProjectsPath(), "utf8"));
    expect(repo.workflows).toHaveLength(1);
  });

  it("makes execution fail at the validated persistence boundary for a missing workflow", async () => {
    const { context } = await setup();
    await expect(executeWorkflow(context, "workflows/workflow-1")).rejects.toThrow(
      "file is missing",
    );
  });

  it("does not execute a caller-supplied prepared workflow", async () => {
    const { context } = await setup();
    const persisted = createReleaseConfig({
      id: "workflow-1",
      project: "project-1",
      name: "Persisted",
      source: { provider: "missing-provider", config: {} },
    });
    await mkdir(context.getConfigPath("workflows"), { recursive: true });
    await writeFile(
      context.getConfigPath("workflows", "workflow-1.json"),
      JSON.stringify(persisted),
    );

    await expect(
      executeWorkflow(context, "workflows/workflow-1", {
        // @ts-expect-error The execution boundary deliberately no longer accepts prepared workflows.
        prepared: {
          config: createReleaseConfig({
            id: "workflow-1",
            project: "project-1",
            name: "Caller supplied",
            source: { provider: "source", config: {} },
          }),
          plan: {
            issues: [],
            producers: [],
            outputs: [],
            destinations: [],
            graph: { nodes: [], edges: [] },
          },
          registry: { sources: [], producers: [], destinations: [] },
          workflow: { steps: [] },
        },
      }),
    ).rejects.toThrow("Unknown source provider: missing-provider");
  });

  it.each(["../connections", "../../foo", "foo/bar", "foo\\bar", "/tmp/workflow"])(
    "rejects unsafe workflow ID %j before filesystem access",
    async (workflowId) => {
      const { persistence } = await setup();
      await expect(persistence.load(workflowId)).rejects.toThrow("not safe for persistence");
    },
  );
});
