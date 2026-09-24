import { describe, expect, it } from "vitest";
import { compileReleasePlan, planRelease, type ReleaseConfig } from "@pipelab/shared";
import electron from "@pipelab/plugin-electron";
import steam from "@pipelab/plugin-steam";
import { createCoreFilesystemWorkflowTasks } from "../workflow-tasks/filesystem";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import { builtInReleaseDefinitions } from "./builtins";
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
  it("registers core Folder and ZIP provider IDs without the Filesystem plugin", () => {
    const registry = buildCoreReleaseRegistry([]);
    expect(registry.sources.map((source) => source.id)).toEqual([
      "@pipelab/core/source/folder",
      "@pipelab/core/source/web-folder",
      "@pipelab/core/source/zip",
      "@pipelab/core/source/web-zip",
    ]);
    expect(registry.destinations.map((destination) => destination.id)).toEqual([
      "@pipelab/core/destination/folder",
      "@pipelab/core/destination/zip",
    ]);
    expect(registry.producers.map((producer) => producer.id)).toEqual([
      "@pipelab/core/passthrough",
      "@pipelab/core/unzip",
    ]);
    expect(CORE_WORKFLOW_TASKS).toEqual({
      copy: "@pipelab/core/fs/copy",
      remove: "@pipelab/core/fs/remove",
      zip: "@pipelab/core/archive/zip",
      unzip: "@pipelab/core/archive/unzip",
      passthrough: "@pipelab/core/passthrough",
    });
    expect(builtInReleaseDefinitions.sources).toHaveLength(4);
  });

  it.each([
    ["Folder", "@pipelab/core/source/folder", { kind: "files", container: "directory" }],
    [
      "Web folder",
      "@pipelab/core/source/web-folder",
      { kind: "application", platform: "web", container: "directory" },
    ],
    ["ZIP", "@pipelab/core/source/zip", { kind: "files", container: "archive", format: "zip" }],
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
        "@pipelab/core/source/folder",
        { path: "/game" },
        [],
        [
          {
            id: "folder",
            provider: "@pipelab/core/destination/folder",
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
        "@pipelab/core/source/folder",
        { path: "/game" },
        [],
        [
          {
            id: "zip",
            provider: "@pipelab/core/destination/zip",
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
        "@pipelab/core/source/web-zip",
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
});
