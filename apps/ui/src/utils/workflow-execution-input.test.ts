import { describe, expect, it, vi } from "vitest";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";
import { submitDesktopWorkflowExecution } from "./workflow-execution-input";

const workflow: ReleaseConfig = {
  version: "3.1.0",
  id: "release-1",
  project: "game-1",
  name: "Release",
  source: {
    provider: "folder",
    config: { path: "${{ env.PROJECT_PATH }}" },
  },
  builds: [
    {
      id: "build-1",
      type: "desktop",
      engine: "engine",
      enabled: true,
      config: { version: "${{ env.BUILD_VERSION }}" },
      targets: [],
    },
  ],
  destinations: [
    {
      id: "itch-one",
      provider: "itch",
      enabled: true,
      config: { accountConnectionId: "${{ env.CONNECTION_ALIAS_SHOULD_NOT_BE_READ }}" },
      slots: [],
    },
  ],
};
const catalog: ReleaseCatalog = {
  buildTypes: [],
  sources: [
    { id: "folder", label: "Folder", output: { kind: "project", container: "directory" }, defaultConfig: {} },
  ],
  producers: [],
  destinations: [
    {
      id: "itch",
      label: "Itch",
      accepts: {},
      defaultConfig: {},
      fields: [
        {
          key: "accountConnectionId",
          type: "connection",
          label: "Itch account",
          integration: "itch",
        },
      ],
    },
  ],
};

describe("Desktop workflow execution submission", () => {
  it("sends only workflow-bound environment values and local Connection values", async () => {
    const environment: Record<string, string> = {
      PROJECT_PATH: "/desktop/game",
      BUILD_VERSION: "4.2.0",
      UNRELATED_SECRET: "do-not-send",
    };
    const readEnvironment = vi.fn(async (names: string[]) => ({
      ...Object.fromEntries(names.map((name) => [name, environment[name]])),
      UNRELATED_SECRET: environment.UNRELATED_SECRET,
    }));
    const execute = vi.fn(async (request) => request);
    const connectionValues = { "itch-production": { apiKey: "provider-secret" } };

    await submitDesktopWorkflowExecution({
      workflow,
      catalog,
      request: {
        name: "workflows/release-1",
        release: { version: "4.2.0", description: "" },
        connectionValues,
      },
      readEnvironment,
      execute,
    });

    expect(readEnvironment).toHaveBeenCalledWith(["PROJECT_PATH", "BUILD_VERSION"]);
    expect(execute).toHaveBeenCalledWith({
      name: "workflows/release-1",
      release: { version: "4.2.0", description: "" },
      env: { PROJECT_PATH: "/desktop/game", BUILD_VERSION: "4.2.0" },
      connectionValues,
    });
    expect(JSON.stringify(execute.mock.calls)).not.toContain("do-not-send");
  });

  it("submits an empty client environment instead of falling back to the Host environment", async () => {
    const execute = vi.fn(async (request) => request);
    const readEnvironment = vi.fn(async () => ({}));

    await submitDesktopWorkflowExecution({
      workflow,
      catalog,
      request: { name: "workflows/release-1" },
      readEnvironment,
      execute,
    });

    expect(execute).toHaveBeenCalledWith({
      name: "workflows/release-1",
      env: {},
    });
  });

  it("does not request environment values from disabled workflow branches", async () => {
    const inactiveWorkflow = structuredClone(workflow);
    inactiveWorkflow.builds[0].enabled = false;
    inactiveWorkflow.builds[0].targets = [
      { id: "web", enabled: true, config: { path: "${{ env.DISABLED_BUILD_TARGET }}" } },
    ];
    inactiveWorkflow.builds.push({
      id: "build-2",
      type: "desktop",
      engine: "engine",
      enabled: true,
      config: {},
      targets: [{ id: "web", enabled: false, config: { path: "${{ env.DISABLED_TARGET }}" } }],
    });
    inactiveWorkflow.destinations[0].enabled = false;
    inactiveWorkflow.destinations[0].config = { path: "${{ env.DISABLED_DESTINATION }}" };
    inactiveWorkflow.destinations[0].slots = [
      { id: "slot-1", enabled: true, config: { path: "${{ env.DISABLED_SLOT }}" } },
    ];
    const readEnvironment = vi.fn(async (names: string[]) =>
      Object.fromEntries(names.map((name) => [name, `value-for-${name}`])),
    );
    const execute = vi.fn(async (request) => request);

    await submitDesktopWorkflowExecution({
      workflow: inactiveWorkflow,
      catalog,
      request: { name: "workflows/release-1" },
      readEnvironment,
      execute,
    });

    expect(readEnvironment).toHaveBeenCalledWith(["PROJECT_PATH"]);
    expect(execute).toHaveBeenCalledWith({
      name: "workflows/release-1",
      env: { PROJECT_PATH: "value-for-PROJECT_PATH" },
    });
  });
});
