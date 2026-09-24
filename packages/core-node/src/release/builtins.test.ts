import { describe, expect, it } from "vitest";
import { compileReleasePlan, planRelease, type ReleaseConfig } from "@pipelab/shared";
import electron from "@pipelab/plugin-electron";
import construct from "@pipelab/plugin-construct";
import steam from "@pipelab/plugin-steam";
import { createCoreFilesystemWorkflowTasks } from "../workflow-tasks/filesystem";
import { builtInReleaseDefinitions, CORE_WORKFLOW_TASKS } from "./builtins";
import { buildCoreReleaseRegistry } from "./registry";

const host = { platform: "linux", architecture: "x64" };

const release = (
  sourceProvider: string,
  sourceConfig: Record<string, unknown> = { path: "/game" },
  builds: ReleaseConfig["builds"] = [],
  destinations: ReleaseConfig["destinations"] = [],
): ReleaseConfig => ({
  version: "3.0.0",
  id: "filesystem-release",
  project: "project",
  name: "Filesystem Release",
  source: { provider: sourceProvider, config: sourceConfig },
  builds,
  destinations,
});

const planAndCompile = (
  config: ReleaseConfig,
  plugins: Parameters<typeof buildCoreReleaseRegistry>[0] = [],
) => {
  const registry = buildCoreReleaseRegistry(plugins);
  const plan = planRelease(config, registry, { host });
  expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return { registry, plan, workflow: compileReleasePlan(config, plan, registry, { host }) };
};

describe("core Release filesystem providers", () => {
  it("keeps the persisted Folder and ZIP provider IDs in the core registry", () => {
    const registry = buildCoreReleaseRegistry([]);
    expect(registry.sources.map((source) => source.id)).toEqual([
      "@pipelab/plugin-filesystem/folder-source",
      "@pipelab/plugin-filesystem/web-folder-source",
      "@pipelab/plugin-filesystem/zip-source",
      "@pipelab/plugin-filesystem/web-zip-source",
    ]);
    expect(registry.destinations.map((destination) => destination.id)).toEqual([
      "@pipelab/plugin-filesystem/folder-destination",
      "@pipelab/plugin-filesystem/zip-destination",
    ]);
    expect(registry.producers.map((producer) => producer.id)).toEqual([
      "@pipelab/core/passthrough",
      "@pipelab/core/unzip",
    ]);
    expect(builtInReleaseDefinitions.sources).toHaveLength(4);
  });

  it.each([
    [
      "Folder",
      "@pipelab/plugin-filesystem/folder-source",
      { kind: "files", container: "directory" },
    ],
    [
      "Web folder",
      "@pipelab/plugin-filesystem/web-folder-source",
      { kind: "application", platform: "web", container: "directory" },
    ],
    [
      "ZIP",
      "@pipelab/plugin-filesystem/zip-source",
      { kind: "files", container: "archive", format: "zip" },
    ],
  ])(
    "plans and compiles the built-in %s source without the Filesystem plugin",
    (_label, provider, descriptor) => {
      const { workflow } = planAndCompile(release(provider));
      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0]).toMatchObject({ uses: CORE_WORKFLOW_TASKS.copy });
      expect(workflow.steps[0].artifacts?.output?.descriptor).toEqual(descriptor);
    },
  );

  it("plans and compiles Folder destinations through the core copy primitive", () => {
    const { workflow } = planAndCompile(
      release(
        "@pipelab/plugin-filesystem/folder-source",
        { path: "/game" },
        [],
        [
          {
            id: "folder",
            provider: "@pipelab/plugin-filesystem/folder-destination",
            enabled: true,
            config: { outputDir: "/output" },
            slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      ),
    );
    expect(workflow.steps.map((step) => step.uses)).toEqual([
      CORE_WORKFLOW_TASKS.copy,
      CORE_WORKFLOW_TASKS.copy,
    ]);
  });

  it("plans and compiles ZIP destinations through the core ZIP primitive", () => {
    const { workflow } = planAndCompile(
      release(
        "@pipelab/plugin-filesystem/folder-source",
        { path: "/game" },
        [],
        [
          {
            id: "zip",
            provider: "@pipelab/plugin-filesystem/zip-destination",
            enabled: true,
            config: { outputPath: "/output/game.zip" },
            slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      ),
    );
    expect(workflow.steps.map((step) => step.uses)).toEqual([
      CORE_WORKFLOW_TASKS.copy,
      CORE_WORKFLOW_TASKS.zip,
    ]);
  });

  it("routes Web ZIP through internal unzip before Electron and keeps passthrough resolvable", () => {
    const { registry, plan, workflow } = planAndCompile(
      release(
        "@pipelab/plugin-filesystem/web-zip-source",
        { path: "/game.zip" },
        [
          {
            id: "electron",
            type: "desktop",
            engine: "@pipelab/plugin-electron/producer",
            enabled: true,
            config: {},
            targets: [{ id: "windows-x64", enabled: true, config: {} }],
          },
        ],
        [
          {
            id: "steam",
            provider: "@pipelab/plugin-steam/destination",
            enabled: true,
            config: { accountConnectionId: "steam", appId: "123" },
            slots: [
              {
                id: "windows",
                enabled: true,
                input: { buildId: "electron", targetId: "windows-x64" },
                config: { depotId: "456" },
              },
            ],
          },
        ],
      ),
      [electron, steam],
    );

    expect(plan.producers.map((producer) => producer.provider)).toContain("@pipelab/core/unzip");
    expect(workflow.steps.map((step) => step.uses)).toContain(CORE_WORKFLOW_TASKS.unzip);
    expect(workflow.steps.map((step) => step.uses)).toContain(
      "@pipelab/plugin-electron/electron:package:v2",
    );
    expect(
      registry.producers.find((producer) => producer.id === "@pipelab/core/passthrough")?.planning,
    ).toEqual({ mode: "automatic" });
    expect(createCoreFilesystemWorkflowTasks()[CORE_WORKFLOW_TASKS.passthrough]).toBeTypeOf(
      "function",
    );
  });

  it("compiles Construct extraction through the core unzip task", () => {
    const { workflow } = planAndCompile(
      release(
        "@pipelab/plugin-construct/source",
        { path: "/game.c3p", profilePath: "/profile" },
        [],
        [],
      ),
      [construct],
    );
    expect(workflow.steps.map((step) => step.uses)).toContain(CORE_WORKFLOW_TASKS.unzip);
    expect(createCoreFilesystemWorkflowTasks()[CORE_WORKFLOW_TASKS.unzip]).toBeTypeOf("function");
  });
});
