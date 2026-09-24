import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSandbox, runCLI } from "@pipelab/test-utils";
import {
  buildCoreReleaseRegistry,
  bundledPlugins,
  createCoreFilesystemWorkflowTasks,
  extractZip,
  zipFolder,
} from "@pipelab/core-node";
import { compileReleasePlan, planRelease, type ReleaseConfig } from "@pipelab/shared";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";

const constructSource = {
  provider: "@pipelab/plugin-construct/source",
  config: { path: "/game.c3p", profilePath: "/profile" },
};

const godotSource = {
  provider: "@pipelab/plugin-godot/source",
  config: { path: "/game" },
};

const poki = (input?: Record<string, string | boolean>) => ({
  id: "poki",
  provider: "@pipelab/plugin-poki/destination",
  enabled: true,
  config: { project: "game", name: "1.0", notes: "release" },
  slots: [{ id: "web", enabled: true, ...(input ? { input } : {}), config: {} }],
});

const steam = (input?: Record<string, string>) => ({
  id: "steam",
  provider: "@pipelab/plugin-steam/destination",
  enabled: true,
  config: { accountConnectionId: "steam", appId: "123" },
  slots: [
    {
      id: "windows",
      enabled: true,
      ...(input ? { input } : {}),
      config: { depotId: "456" },
    },
  ],
});

describe("CLI release dry-run", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    await sandbox?.remove();
  });

  const runDryRun = async (config: Record<string, unknown>) => {
    sandbox = await createSandbox(String(config.id));
    const configPath = join(sandbox.paths.userData, "config");
    const resultPath = join(sandbox.path, "dry-run.json");
    await mkdir(join(configPath, "workflows"), { recursive: true });
    await writeFile(
      join(configPath, "projects.json"),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "main", name: "Main", description: "CLI test" }],
        pipelines: [],
        workflows: [
          {
            id: config.id,
            project: "main",
            lastModified: new Date().toISOString(),
            type: "internal-workflow",
            configName: `workflows/${config.id}`,
          },
        ],
      }),
    );
    await writeFile(
      join(configPath, "connections.json"),
      JSON.stringify({
        version: "1.0.0",
        connections: [
          {
            id: "steam",
            pluginName: "@pipelab/plugin-steam",
            name: "Steam test account",
            createdAt: new Date().toISOString(),
            isDefault: true,
          },
        ],
      }),
    );
    await writeFile(join(configPath, "workflows", `${config.id}.json`), JSON.stringify(config));
    await runCLI([
      "workflow",
      "run",
      String(config.id),
      "--user-data",
      sandbox.paths.userData,
      "--dry-run",
      "--output",
      resultPath,
    ]);
    return JSON.parse(await readFile(resultPath, "utf8"));
  };

  const executeCoreRelease = async (config: ReleaseConfig, workspace: string) => {
    const registry = buildCoreReleaseRegistry([]);
    const context = {
      host: { platform: process.platform, architecture: process.arch },
    };
    const plan = planRelease(config, registry, context);
    expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const workflow = compileReleasePlan(config, plan, registry, context);
    return runWorkflow(workflow, {
      host: createLocalHost(workspace),
      variables: { workspace },
      tasks: createCoreFilesystemWorkflowTasks(),
    });
  };

  test(
    "fails predictably for malformed persisted workflows",
    async () => {
      sandbox = await createSandbox("workflow-malformed-e2e");
      const configPath = join(sandbox.paths.userData, "config");
      const workflowId = "malformed-workflow";
      await mkdir(join(configPath, "workflows"), { recursive: true });
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: workflowId,
              project: "main",
              lastModified: new Date().toISOString(),
              type: "internal-workflow",
              configName: `workflows/${workflowId}`,
            },
          ],
        }),
      );
      await writeFile(join(configPath, "workflows", `${workflowId}.json`), "{broken");

      await expect(
        runCLI(["workflow", "run", workflowId, "--user-data", sandbox.paths.userData, "--dry-run"]),
      ).rejects.toThrow(/invalid persisted data|Malformed JSON/);
    },
    30 * 60 * 1000,
  );

  test(
    "lists, resolves by name, and deletes workflows through strict persistence",
    async () => {
      sandbox = await createSandbox("workflow-commands-e2e");
      const configPath = join(sandbox.paths.userData, "config");
      const workflowId = "workflow-command-test";
      await mkdir(join(configPath, "workflows"), { recursive: true });
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: workflowId,
              project: "main",
              lastModified: new Date().toISOString(),
              type: "internal-workflow",
              configName: `workflows/${workflowId}`,
            },
          ],
        }),
      );
      await writeFile(
        join(configPath, "workflows", `${workflowId}.json`),
        JSON.stringify({
          version: "3.0.0",
          id: workflowId,
          project: "main",
          name: "Command workflow",
          source: {
            provider: "@pipelab/core/source/folder",
            config: { path: sandbox.paths.input },
          },
          builds: [],
          destinations: [],
        }),
      );

      const listed = await runCLI(["workflow", "list", "--user-data", sandbox.paths.userData]);
      expect(listed.stdout).toContain("Command workflow (workflow-command-test)");

      const dryRun = await runCLI([
        "workflow",
        "run",
        "Command workflow",
        "--user-data",
        sandbox.paths.userData,
        "--dry-run",
      ]);
      expect(dryRun.stdout).toContain("Dry run for Command workflow");

      await runCLI([
        "workflow",
        "delete",
        workflowId,
        "--user-data",
        sandbox.paths.userData,
        "--force",
      ]);
      const projects = JSON.parse(await readFile(join(configPath, "projects.json"), "utf8"));
      expect(projects.workflows).toEqual([]);
      await expect(access(join(configPath, "workflows", `${workflowId}.json`))).rejects.toThrow();
    },
    30 * 60 * 1000,
  );

  test(
    "loads plugins, plans, compiles, and does not execute workflow steps",
    async () => {
      sandbox = await createSandbox("release-dry-run");
      const sourcePath = join(sandbox.paths.input, "source");
      const destinationPath = join(sandbox.paths.output, "destination");
      const configPath = join(sandbox.paths.userData, "config");
      const resultPath = join(sandbox.path, "dry-run.json");

      await mkdir(sourcePath, { recursive: true });
      await mkdir(join(configPath, "workflows"), { recursive: true });
      await writeFile(join(sourcePath, "index.html"), "<h1>dry run</h1>");
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: "release-dry-run",
              project: "main",
              type: "internal-workflow",
              lastModified: new Date().toISOString(),
              configName: "workflows/release-dry-run",
            },
          ],
        }),
      );
      await writeFile(
        join(configPath, "workflows", "release-dry-run.json"),
        JSON.stringify({
          version: "3.0.0",
          id: "release-dry-run",
          project: "main",
          name: "Release dry run",
          source: {
            provider: "@pipelab/core/source/folder",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "copy-output",
              provider: "@pipelab/core/destination/folder",
              enabled: true,
              config: { outputDir: destinationPath },
              slots: [
                {
                  id: "source",
                  enabled: true,
                  input: { source: true },
                  config: {},
                },
              ],
            },
          ],
        }),
      );

      await runCLI([
        "workflow",
        "run",
        "release-dry-run",
        "--user-data",
        sandbox.paths.userData,
        "--dry-run",
        "--output",
        resultPath,
      ]);

      const result = JSON.parse(await readFile(resultPath, "utf8"));
      expect(result.type).toBe("workflow-dry-run");
      expect(result.plan.destinations[0].slots[0].input).toEqual({
        source: true,
      });
      expect(result.workflow.steps.map((step: { id: string }) => step.id)).toEqual([
        "release-folder-source",
        "release-folder-copy-output-source",
      ]);
      await expect(access(destinationPath)).rejects.toThrow();
    },
    30 * 60 * 1000,
  );

  test(
    "executes Folder and ZIP destinations with core tasks and no filesystem plugin tasks",
    async () => {
      sandbox = await createSandbox("release-core-filesystem-tasks");
      const sourcePath = join(sandbox.paths.input, "source");
      const workspace = join(sandbox.path, "workflow-workspace");
      const folderOutput = join(sandbox.paths.output, "folder-destination");
      const zipOutput = join(sandbox.paths.output, "zip-destination", "game.zip");
      const zipExtracted = join(sandbox.path, "zip-extracted");
      await mkdir(sourcePath, { recursive: true });
      await writeFile(join(sourcePath, "index.html"), "core release");
      await mkdir(workspace, { recursive: true });

      const folderResult = await executeCoreRelease(
        {
          version: "3.0.0",
          id: "core-folder-release",
          project: "main",
          name: "Core Folder Release",
          source: {
            provider: "@pipelab/core/source/folder",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "folder",
              provider: "@pipelab/core/destination/folder",
              enabled: true,
              config: { outputDir: folderOutput },
              slots: [
                {
                  id: "source",
                  enabled: true,
                  input: { source: true },
                  config: {},
                },
              ],
            },
          ],
        },
        workspace,
      );
      expect(folderResult.status).toBe("completed");
      expect(await readFile(join(folderOutput, "index.html"), "utf8")).toBe("core release");

      const zipResult = await executeCoreRelease(
        {
          version: "3.0.0",
          id: "core-zip-release",
          project: "main",
          name: "Core ZIP Release",
          source: {
            provider: "@pipelab/core/source/folder",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "zip",
              provider: "@pipelab/core/destination/zip",
              enabled: true,
              config: { outputPath: zipOutput },
              slots: [
                {
                  id: "source",
                  enabled: true,
                  input: { source: true },
                  config: {},
                },
              ],
            },
          ],
        },
        workspace,
      );
      expect(zipResult.status).toBe("completed");
      await expect(access(zipOutput)).resolves.toBeUndefined();
      await extractZip(zipOutput, zipExtracted);
      expect(await readFile(join(zipExtracted, "index.html"), "utf8")).toBe("core release");
    },
    30 * 60 * 1000,
  );

  test(
    "runs Web ZIP through the core unzip task before Electron",
    async () => {
      sandbox = await createSandbox("release-web-zip-electron-core-unzip");
      const webFolder = join(sandbox.paths.input, "web");
      const webZip = join(sandbox.paths.input, "web.zip");
      const workspace = join(sandbox.path, "workflow-workspace");
      const outputPath = join(sandbox.paths.output, "electron-output");
      await mkdir(webFolder, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await writeFile(join(webFolder, "index.html"), "web release");
      await zipFolder(webFolder, webZip);

      const electronPlugin = bundledPlugins.find(
        (plugin) => plugin.id === "@pipelab/plugin-electron",
      );
      if (!electronPlugin) throw new Error("Electron Release provider is not bundled");
      const registry = buildCoreReleaseRegistry([electronPlugin]);
      const config: ReleaseConfig = {
        version: "3.0.0",
        id: "web-zip-electron-core-unzip",
        project: "main",
        name: "Web ZIP Electron Release",
        source: {
          provider: "@pipelab/core/source/web-zip",
          config: { path: webZip },
        },
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
            id: "folder",
            provider: "@pipelab/core/destination/folder",
            enabled: true,
            config: { outputDir: outputPath },
            slots: [
              {
                id: "windows",
                enabled: true,
                input: { buildId: "electron", targetId: "windows-x64" },
                config: {},
              },
            ],
          },
        ],
      };
      const context = {
        host: { platform: process.platform, architecture: process.arch },
      };
      const plan = planRelease(config, registry, context);
      expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(plan.producers.some((producer) => producer.provider === "@pipelab/core/unzip")).toBe(
        true,
      );
      const workflow = compileReleasePlan(config, plan, registry, context);
      expect(workflow.steps.some((step) => step.uses === "@pipelab/core/archive/unzip")).toBe(true);

      const tasks = createCoreFilesystemWorkflowTasks();
      tasks["@pipelab/plugin-electron/electron:package:v2"] = async (taskContext) => {
        const input = taskContext.inputs["input-folder"];
        if (typeof input !== "string")
          throw new Error("Electron package task requires an input folder");
        expect(await readFile(join(input, "index.html"), "utf8")).toBe("web release");
        const output = join(taskContext.workspace.root, "electron-output");
        await mkdir(output, { recursive: true });
        await writeFile(join(output, "packaged.txt"), "packaged");
        taskContext.setArtifact("electron-build", output);
        return { "electron-build": output };
      };
      const result = await runWorkflow(workflow, {
        host: createLocalHost(workspace),
        variables: { workspace },
        tasks,
      });

      expect(result.status).toBe("completed");
      expect(await readFile(join(outputPath, "packaged.txt"), "utf8")).toBe("packaged");
    },
    30 * 60 * 1000,
  );

  test(
    "cancels a Release workflow while the core unzip task is running",
    async () => {
      sandbox = await createSandbox("release-core-unzip-cancellation");
      const webFolder = join(sandbox.paths.input, "web");
      const webZip = join(sandbox.paths.input, "web.zip");
      const workspace = join(sandbox.path, "workflow-workspace");
      await mkdir(webFolder, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await writeFile(join(webFolder, "large.bin"), randomBytes(32 * 1024 * 1024));
      await zipFolder(webFolder, webZip, () => undefined);

      const electronPlugin = bundledPlugins.find(
        (plugin) => plugin.id === "@pipelab/plugin-electron",
      );
      if (!electronPlugin) throw new Error("Electron Release provider is not bundled");
      const registry = buildCoreReleaseRegistry([electronPlugin]);
      const config: ReleaseConfig = {
        version: "3.0.0",
        id: "web-zip-cancel-unzip",
        project: "main",
        name: "Cancel Web ZIP extraction",
        source: {
          provider: "@pipelab/core/source/web-zip",
          config: { path: webZip },
        },
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
        destinations: [],
      };
      const context = { host: { platform: process.platform, architecture: process.arch } };
      const plan = planRelease(config, registry, context);
      expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      const workflow = compileReleasePlan(config, plan, registry, context);
      const controller = new AbortController();
      const run = runWorkflow(workflow, {
        host: createLocalHost(workspace),
        variables: { workspace },
        tasks: createCoreFilesystemWorkflowTasks(),
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "step.started" && event.uses === "@pipelab/core/archive/unzip") {
            setTimeout(() => controller.abort("test cancellation"), 20);
          }
        },
      });

      await expect(run).rejects.toMatchObject({ name: "AbortError" });
      expect(controller.signal.aborted).toBe(true);
    },
    30 * 60 * 1000,
  );

  test(
    "routes Construct directly to Poki without a Desktop build",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "construct-poki",
        project: "main",
        name: "Construct Poki",
        source: constructSource,
        builds: [],
        destinations: [poki({ source: true })],
      });

      expect(result.config.builds).toHaveLength(0);
      expect(result.plan.destinations[0].slots[0].input).toEqual({
        source: true,
      });
      expect(
        result.workflow.steps.some((step: { uses: string }) => step.uses.includes("electron")),
      ).toBe(false);
    },
    30 * 60 * 1000,
  );

  test(
    "resolves Construct to one Electron Desktop build for Steam",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "construct-steam",
        project: "main",
        name: "Construct Steam",
        source: constructSource,
        builds: [],
        destinations: [steam()],
      });

      expect(result.config.builds).toHaveLength(1);
      expect(result.config.builds[0].engine).toBe("@pipelab/plugin-electron/producer");
      expect(result.config.builds[0].targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "windows-x64", enabled: true }),
          expect.objectContaining({ id: "linux-x64", enabled: false }),
          expect.objectContaining({ id: "macos-arm64", enabled: false }),
        ]),
      );
      expect(result.plan.destinations[0].slots[0].input).toEqual({
        producerId: result.config.builds[0].id,
        outputId: "windows-x64",
      });
      expect(result.config.destinations[0].slots[0].input).toEqual({
        buildId: result.config.builds[0].id,
        targetId: "windows-x64",
      });
      expect(
        result.workflow.steps.find((step: { id: string }) => step.id.endsWith("windows-x64")),
      ).toMatchObject({ needs: ["construct-source-extract"] });
      expect(
        result.workflow.steps.filter((step: { uses: string }) =>
          step.uses.includes("plugin-electron"),
        ).length,
      ).toBe(1);
    },
    30 * 60 * 1000,
  );

  test(
    "reuses an existing compatible Desktop build",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "construct-existing-build",
        project: "main",
        name: "Construct existing build",
        source: constructSource,
        builds: [
          {
            id: "desktop",
            type: "desktop",
            engine: "@pipelab/plugin-electron/producer",
            enabled: true,
            config: {},
            targets: [{ id: "windows-x64", enabled: true, config: {} }],
          },
        ],
        destinations: [steam()],
      });

      expect(result.config.builds).toHaveLength(1);
      expect(result.config.builds[0].id).toBe("desktop");
      expect(result.config.destinations[0].slots[0].input).toEqual({
        buildId: "desktop",
        targetId: "windows-x64",
      });
      expect(
        result.workflow.steps.filter((step: { uses: string }) =>
          step.uses.includes("plugin-electron"),
        ).length,
      ).toBe(1);
    },
    30 * 60 * 1000,
  );

  test(
    "shares one Desktop build between Steam and Poki",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "construct-steam-poki",
        project: "main",
        name: "Construct Steam and Poki",
        source: constructSource,
        builds: [],
        destinations: [poki({ source: true }), steam()],
      });

      expect(result.config.builds).toHaveLength(1);
      expect(result.plan.destinations[0].slots[0].input).toEqual({
        source: true,
      });
      expect(result.plan.destinations[1].slots[0].input).toMatchObject({
        outputId: "windows-x64",
      });
      expect(
        result.workflow.steps.filter((step: { uses: string }) =>
          step.uses.includes("plugin-electron"),
        ).length,
      ).toBe(1);
    },
    30 * 60 * 1000,
  );

  test(
    "rejects the incompatible Electron default for Godot to Steam",
    async () => {
      sandbox = await createSandbox("godot-steam");
      const configPath = join(sandbox.paths.userData, "config");
      await mkdir(join(configPath, "workflows"), { recursive: true });
      const config = {
        version: "3.0.0",
        id: "godot-steam",
        project: "main",
        name: "Godot Steam",
        source: godotSource,
        builds: [],
        destinations: [steam()],
      };
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: "godot-steam",
              project: "main",
              type: "internal-workflow",
              lastModified: new Date().toISOString(),
              configName: "workflows/godot-steam",
            },
          ],
        }),
      );
      await writeFile(join(configPath, "workflows", "godot-steam.json"), JSON.stringify(config));

      await expect(
        runCLI([
          "workflow",
          "run",
          "godot-steam",
          "--user-data",
          sandbox.paths.userData,
          "--dry-run",
        ]),
      ).rejects.toThrow();
    },
    30 * 60 * 1000,
  );

  test(
    "inserts the automatic unzip transform before an Electron build",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "zip-electron",
        project: "main",
        name: "ZIP Poki",
        source: {
          provider: "@pipelab/core/source/web-zip",
          config: { path: "/game.zip" },
        },
        builds: [
          {
            id: "desktop",
            type: "desktop",
            engine: "@pipelab/plugin-electron/producer",
            enabled: true,
            config: {},
            targets: [{ id: "windows-x64", enabled: true, config: {} }],
          },
        ],
        destinations: [steam({ buildId: "desktop", targetId: "windows-x64" })],
      });

      expect(
        result.plan.producers.some((producer: { provider: string }) =>
          producer.provider.includes("unzip"),
        ),
      ).toBe(true);
      expect(
        result.workflow.steps.some((step: { uses: string }) => step.uses.includes("unzip")),
      ).toBe(true);
    },
    30 * 60 * 1000,
  );
});
