import { describe, expect, it } from "vitest";
import { compileReleasePlan, planRelease, type ReleaseConfig } from "@pipelab/shared";
import { createCoreFilesystemWorkflowTasks } from "../workflow-tasks/filesystem";
import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import { builtInReleaseDefinitions } from "./builtins";
import { assertUniqueReleaseIds, buildCoreReleaseRegistry } from "./registry";

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

const planAndCompile = (config: ReleaseConfig) => {
  const registry = buildCoreReleaseRegistry();
  const plan = planRelease(config, registry, { host });
  expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return { registry, plan, workflow: compileReleasePlan(config, plan, registry, { host }) };
};

describe("core Release filesystem providers", () => {
  it("keeps contribution IDs unique and rejects duplicate IDs by contribution type", () => {
    const registry = buildCoreReleaseRegistry();

    for (const definitions of [registry.sources, registry.producers, registry.destinations]) {
      expect(new Set(definitions.map((definition) => definition.id)).size).toBe(definitions.length);
    }

    expect(() => assertUniqueReleaseIds("source", ["duplicate", "duplicate"])).toThrow(
      "Duplicate Release source ID: duplicate",
    );
    expect(() => assertUniqueReleaseIds("producer", ["duplicate", "duplicate"])).toThrow(
      "Duplicate Release producer ID: duplicate",
    );
    expect(() => assertUniqueReleaseIds("destination", ["duplicate", "duplicate"])).toThrow(
      "Duplicate Release destination ID: duplicate",
    );
  });

  it("registers core Folder and ZIP provider IDs without the Filesystem plugin", () => {
    const registry = buildCoreReleaseRegistry();
    expect(registry.sources.map((source) => source.id)).toEqual([
      "@pipelab/core/source/folder",
      "@pipelab/core/source/web-folder",
      "@pipelab/core/source/zip",
      "@pipelab/core/source/web-zip",
      "@pipelab/plugin-construct/source",
      "@pipelab/plugin-godot/source",
    ]);
    expect(registry.destinations.map((destination) => destination.id)).toEqual([
      "@pipelab/core/destination/folder",
      "@pipelab/core/destination/zip",
      "@pipelab/plugin-steam/destination",
      "@pipelab/plugin-itch/destination",
      "@pipelab/plugin-poki/destination",
      "@pipelab/pipelab-cloud/destination",
    ]);
    expect(registry.producers.map((producer) => producer.id)).toEqual([
      "@pipelab/core/passthrough",
      "@pipelab/core/unzip",
      "@pipelab/core/bundle",
      "@pipelab/plugin-construct/producer",
      "@pipelab/plugin-electron/producer",
      "@pipelab/plugin-tauri/producer",
      "@pipelab/plugin-godot/producer",
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

  it("advertises ZIP file constraints to the source picker", () => {
    const zipSource = buildCoreReleaseRegistry().sources.find(
      (source) => source.id === "@pipelab/core/source/zip",
    );
    expect(zipSource?.fields?.[0]).toMatchObject({ type: "file", fileExtensions: ["zip"] });
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
        [
          {
            id: "bundle",
            type: "bundle",
            engine: "@pipelab/core/bundle",
            inputs: [{ source: true }],
            config: {},
            targets: [{ id: "zip", config: {} }],
          },
        ],
        [
          {
            id: "folder",
            provider: "@pipelab/core/destination/folder",
            enabled: true,
            config: {},
            slots: [
              {
                id: "bundle",
                enabled: true,
                input: { buildId: "bundle", targetId: "zip" },
                config: { outputDir: "/output" },
              },
            ],
          },
        ],
      ),
    );
    // Source copy, bundle staging copy, bundle ZIP, then the Folder copy of the bundle output.
    expect(workflow.steps.map((step) => step.uses)).toEqual([
      CORE_WORKFLOW_TASKS.copy,
      CORE_WORKFLOW_TASKS.copy,
      CORE_WORKFLOW_TASKS.zip,
      CORE_WORKFLOW_TASKS.copy,
    ]);
    expect(workflow.steps.at(-1)?.with).toMatchObject({ to: "/output/Deployment 1" });
  });

  it("requires a build for Folder destinations and no other built-in destination", () => {
    const destinations = buildCoreReleaseRegistry().destinations;
    expect(
      destinations.filter((destination) => destination.requiresBuild).map((item) => item.id),
    ).toEqual(["@pipelab/core/destination/folder"]);
  });

  it("refuses the raw source in a Folder destination slot", () => {
    const config = release(
      "@pipelab/core/source/folder",
      { path: "/game" },
      [],
      [
        {
          id: "folder",
          provider: "@pipelab/core/destination/folder",
          enabled: true,
          config: {},
          slots: [
            {
              id: "source",
              enabled: true,
              input: { source: true },
              config: { outputDir: "/output" },
            },
          ],
        },
      ],
    );
    const plan = planRelease(config, buildCoreReleaseRegistry(), { host });
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: "release.destination.input.build-required",
        severity: "error",
        path: "destinations.0.slots.0.input",
      }),
    );
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
            config: {},
            slots: [
              {
                id: "source",
                enabled: true,
                input: { source: true },
                config: { outputPath: "/output/game.zip" },
              },
            ],
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
            config: {},
            targets: [{ id: "windows-x64", config: {} }],
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

describe("Construct builds in the core Release compiler", () => {
  const constructSource = {
    path: "/game.c3p",
    profilePath: "/profile",
    version: "",
    accountConnectionId: "",
  };
  const constructWebBuild: ReleaseConfig["builds"][number] = {
    id: "construct",
    type: "web",
    engine: "@pipelab/plugin-construct/producer",
    config: {},
    targets: [{ id: "web", config: {} }],
  };
  const electronBuild: ReleaseConfig["builds"][number] = {
    id: "electron",
    type: "desktop",
    engine: "@pipelab/plugin-electron/producer",
    config: {},
    targets: [{ id: "windows-x64", config: {} }],
  };
  const constructSteps = (steps: readonly { id: string }[]) =>
    steps.filter((step) => step.id.includes("construct")).map((step) => step.id);

  it("compiles a source-only Construct release to the project passthrough", () => {
    const { workflow } = planAndCompile(
      release("@pipelab/plugin-construct/source", constructSource, []),
    );
    expect(workflow.steps.map((step) => step.uses)).toEqual([CORE_WORKFLOW_TASKS.passthrough]);
    expect(constructSteps(workflow.steps)).toEqual(["release-construct-source"]);
  });

  it("runs the Construct web export once when Electron consumes the Construct web build", () => {
    const { workflow } = planAndCompile(
      release(
        "@pipelab/plugin-construct/source",
        constructSource,
        [constructWebBuild, electronBuild],
        [
          {
            id: "folder",
            provider: "@pipelab/core/destination/folder",
            enabled: true,
            config: {},
            slots: [
              {
                id: "windows",
                enabled: true,
                input: { buildId: "electron", targetId: "windows-x64" },
                config: { outputDir: "/output" },
              },
            ],
          },
        ],
      ),
    );
    expect(constructSteps(workflow.steps)).toEqual([
      "release-construct-source",
      "construct-web-export",
      "construct-web-extract",
    ]);
    expect(workflow.steps.filter((step) => step.id === "construct-web-export")).toHaveLength(1);
  });
});
