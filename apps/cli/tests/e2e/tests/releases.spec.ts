import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSandbox, runCLI } from "@pipelab/test-utils";
import {
  buildCoreReleaseRegistry,
  builtInProviders,
  createCoreFilesystemWorkflowTasks,
  extractZip,
  PipelabContext,
  zipFolder,
  type ProviderServices,
} from "@pipelab/core-node";
import {
  compileReleasePlan,
  planRelease,
  RELEASE_BEFORE_BUILD_TASK_ID,
  RELEASE_CONFIG_VERSION,
  type ReleaseConfig,
} from "@pipelab/shared";
import { createLocalHost, runWorkflow, type WorkflowResult } from "@pipelab/workflow-runtime";
import { releaseBeforeBuildWorkflowTask } from "@pipelab/core-node";

const constructSource = {
  provider: "@pipelab/plugin-construct/source",
  config: { path: "/game.c3p", profilePath: "/profile" },
};

const godotSource = {
  provider: "@pipelab/plugin-godot/source",
  config: { path: "/game" },
};

const hookServices = (
  workspace: string,
  id: string,
  workflowId: string,
  projectId: string,
  releaseVersion: string,
): ProviderServices => ({
  context: new PipelabContext({ userDataPath: join(workspace, "user-data") }),
  executables: { node: process.execPath, pnpm: join(workspace, "pnpm.cjs") },
  run: { id, workflowId, projectId, releaseVersion },
  workflowCachePath: workspace,
});

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

  const runDryRun = async (
    configInput:
      | Record<string, unknown>
      | ((
          sandbox: Awaited<ReturnType<typeof createSandbox>>,
        ) => Record<string, unknown> | Promise<Record<string, unknown>>),
  ) => {
    sandbox = await createSandbox(
      String(typeof configInput === "function" ? "release-workflow" : configInput.id),
    );
    const config = typeof configInput === "function" ? await configInput(sandbox) : configInput;
    const configPath = join(sandbox.paths.userData, "config");
    const resultPath = join(sandbox.path, "dry-run.json");
    await mkdir(join(configPath, "workflows"), { recursive: true });
    await writeFile(
      join(configPath, "projects.json"),
      JSON.stringify({
        version: "3.0.0",
        projects: [{ id: "main", name: "Main", description: "CLI test" }],
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
    const registry = buildCoreReleaseRegistry();
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

      const electronPlugin = builtInProviders.find(
        (plugin) => plugin.id === "@pipelab/plugin-electron",
      );
      if (!electronPlugin) throw new Error("Electron Release provider is not bundled");
      const registry = buildCoreReleaseRegistry();
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

      const electronPlugin = builtInProviders.find(
        (plugin) => plugin.id === "@pipelab/plugin-electron",
      );
      if (!electronPlugin) throw new Error("Electron Release provider is not bundled");
      const registry = buildCoreReleaseRegistry();
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
            setTimeout(() => {
              controller.abort("test cancellation");
            }, 20);
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
        result.workflow.steps.find((step: { id: string }) => step.id === "construct-source-export"),
      ).toMatchObject({
        with: { file: "/game.c3p", customProfile: "/profile", version: "" },
      });
      expect(
        result.workflow.steps.some((step: { uses: string }) => step.uses.includes("electron")),
      ).toBe(false);
    },
    30 * 60 * 1000,
  );

  test(
    "passes a Construct version override to the export task",
    async () => {
      const result = await runDryRun({
        version: "3.0.0",
        id: "construct-version-override",
        project: "main",
        name: "Construct version override",
        source: {
          ...constructSource,
          config: { ...constructSource.config, version: "r397" },
        },
        builds: [],
        destinations: [poki({ source: true })],
      });

      expect(
        result.workflow.steps.find((step: { id: string }) => step.id === "construct-source-export"),
      ).toMatchObject({ with: { version: "r397" } });
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
    "dry-runs hooks without executing them and runs the single command in CLI without approval",
    async () => {
      const configId = "before-build-hook-cli-trust";
      const markerPath = join(
        "/tmp",
        `pipelab-before-build-hook-${randomBytes(6).toString("hex")}.marker`,
      );
      const result = await runDryRun(async (testSandbox) => {
        await mkdir(testSandbox.paths.input, { recursive: true });
        await writeFile(
          join(testSandbox.paths.input, "write-marker.js"),
          `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "ran"); process.exit(2);`,
        );
        return {
          version: RELEASE_CONFIG_VERSION,
          id: configId,
          project: "main",
          name: "Before build hook CLI trust",
          source: {
            provider: "@pipelab/core/source/web-folder",
            config: { path: testSandbox.paths.input },
          },
          builds: [
            {
              id: "electron-profile",
              type: "desktop",
              engine: "@pipelab/plugin-electron/producer",
              enabled: true,
              config: {},
              targets: [{ id: "windows-x64", enabled: true, config: {} }],
              beforeBuild: [
                { id: "write-marker", enabled: true, command: "node ./write-marker.js" },
              ],
            },
          ],
          destinations: [],
        };
      });

      expect(
        result.workflow.steps.some(
          (step: { uses: string }) => step.uses === RELEASE_BEFORE_BUILD_TASK_ID,
        ),
      ).toBe(true);
      await expect(access(markerPath)).rejects.toThrow();
      expect(result.config.builds[0].beforeBuild[0]).toEqual({
        id: "write-marker",
        enabled: true,
        command: "node ./write-marker.js",
      });
      expect(JSON.stringify(result.workflow)).not.toContain("PIPELAB_");
      const failedRun = await runCLI([
        "workflow",
        "run",
        configId,
        "--user-data",
        sandbox!.paths.userData,
      ]).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failedRun).toMatchObject({
        stdout: expect.stringContaining("beforeBuild command exited with code 2"),
        stderr: expect.stringContaining("exited with code 2"),
      });
      expect(failedRun).toMatchObject({
        stdout: expect.not.stringContaining("✔ Before build hook CLI trust"),
      });
      await expect(readFile(markerPath, "utf8")).resolves.toBe("ran");
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

describe("Release beforeBuild hooks", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    await sandbox?.remove();
  });

  test(
    "runs the real Construct SDK script against isolated profile copies before Electron consumes them",
    async () => {
      sandbox = await createSandbox("release-construct-before-build-hooks");
      const projectFile = join(sandbox.paths.input, "game.c3p");
      const exportedFolder = join(sandbox.paths.input, "construct-export");
      const workspace = join(sandbox.path, "workflow-workspace");
      const buildStaging = join(sandbox.paths.output, "workflow-staging");
      const savedWorkflowPath = join(sandbox.path, "saved-workflow.json");
      const sdkEntry: unknown[] = Array.from({ length: 17 }, () => null);
      sdkEntry[0] = "DedraSDKWrapper";
      sdkEntry[16] = [2];
      const originalData = { project: [null, null, null, [sdkEntry]] };
      const script = [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const requested = process.argv[2];",
        'if (requested !== "0" && requested !== "1") throw new Error("SDK flag must be 0 or 1");',
        'const runtime = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("PIPELAB_")));',
        'fs.writeFileSync(path.join(__dirname, "runtime.json"), JSON.stringify({ runtime, cwd: process.cwd(), dirname: __dirname }));',
        'const file = path.join(__dirname, "data.json");',
        'const data = JSON.parse(fs.readFileSync(file, "utf8"));',
        'const entry = data.project[3].find((candidate) => candidate[0] === "DedraSDKWrapper");',
        'if (!entry || !Array.isArray(entry[16])) throw new Error("DedraSDKWrapper entry is missing");',
        "entry[16][0] = Number(requested);",
        "fs.writeFileSync(file, JSON.stringify(data));",
      ].join("\n");
      await mkdir(exportedFolder, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await mkdir(buildStaging, { recursive: true });
      await writeFile(projectFile, "original Construct project");
      await writeFile(join(exportedFolder, "data.json"), JSON.stringify(originalData));
      await writeFile(join(exportedFolder, "setSDKEnabled.js"), script);
      await writeFile(join(workspace, "pnpm.cjs"), 'console.log("MANAGED_PNPM");');

      const config: ReleaseConfig = {
        version: RELEASE_CONFIG_VERSION,
        id: "construct-sdk-before-build",
        project: "main",
        name: "Construct SDK profile variants",
        source: {
          provider: "@pipelab/plugin-construct/source",
          config: { path: projectFile, profilePath: "/fixture/browser-profile" },
        },
        builds: [
          {
            id: "sdk-off",
            name: "SDK disabled",
            type: "desktop",
            engine: "@pipelab/plugin-electron/producer",
            enabled: true,
            config: {},
            targets: [{ id: "windows-x64", enabled: true, config: {} }],
            beforeBuild: [
              {
                id: "set-sdk-off",
                enabled: true,
                command: "node ./setSDKEnabled.js 0 && pnpm --version",
              },
            ],
          },
          {
            id: "sdk-on",
            name: "SDK enabled",
            type: "desktop",
            engine: "@pipelab/plugin-electron/producer",
            enabled: true,
            config: {},
            targets: [{ id: "windows-x64", enabled: true, config: {} }],
            beforeBuild: [
              {
                id: "set-sdk-on",
                enabled: true,
                command: "node ./setSDKEnabled.js 1 && pnpm --version",
              },
            ],
          },
        ],
        destinations: [],
      };
      await writeFile(savedWorkflowPath, JSON.stringify(config));
      const savedConfig = JSON.parse(await readFile(savedWorkflowPath, "utf8")) as ReleaseConfig;
      const registry = buildCoreReleaseRegistry();
      const context = {
        host: { platform: process.platform, architecture: process.arch },
      };
      const plan = planRelease(savedConfig, registry, context);
      expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      const workflow = compileReleasePlan(savedConfig, plan, registry, context);
      const hookSteps = workflow.steps.filter((step) => step.uses === RELEASE_BEFORE_BUILD_TASK_ID);
      expect(hookSteps.map((step) => step.with?.command)).toEqual([
        "node ./setSDKEnabled.js 0 && pnpm --version",
        "node ./setSDKEnabled.js 1 && pnpm --version",
      ]);
      expect(
        hookSteps.every(
          (step) => !Object.keys(step.with || {}).some((key) => key.startsWith("PIPELAB_")),
        ),
      ).toBe(true);
      expect(
        workflow.steps.filter(
          (step) => step.uses === "@pipelab/plugin-construct/export-construct-project",
        ),
      ).toHaveLength(1);
      expect(
        workflow.steps.filter((step) => step.uses === "@pipelab/core/archive/unzip"),
      ).toHaveLength(1);

      const extraction = workflow.steps.find((step) => step.id === "construct-source-extract");
      const electronInputs: Array<{ id: string; path: string; value: number; output: string }> = [];
      const logMessages: string[] = [];
      let constructExportCount = 0;
      const tasks = {
        ...createCoreFilesystemWorkflowTasks(),
        [RELEASE_BEFORE_BUILD_TASK_ID]: releaseBeforeBuildWorkflowTask,
        "@pipelab/plugin-construct/export-construct-project": async (taskContext: {
          workspace: { root: string };
          inputs: Record<string, unknown>;
          setArtifact(outputId: string, path: string): void;
        }) => {
          constructExportCount += 1;
          const output = join(taskContext.workspace.root, "construct-export.zip");
          await zipFolder(exportedFolder, output);
          taskContext.setArtifact("zipFile", output);
          return { zipFile: output };
        },
        "@pipelab/plugin-electron/electron:package:v2": async (taskContext: {
          step: { id: string };
          workspace: { root: string };
          inputs: Record<string, unknown>;
          setArtifact(outputId: string, path: string): void;
        }) => {
          const input = taskContext.inputs["input-folder"];
          if (typeof input !== "string") throw new Error("Electron input folder was not provided");
          const inputData = JSON.parse(await readFile(join(input, "data.json"), "utf8")) as {
            project: unknown[];
          };
          const wrapper = inputData.project[3];
          if (!Array.isArray(wrapper)) throw new Error("DedraSDKWrapper entry was not exported");
          const sdk = wrapper.find(
            (entry) => Array.isArray(entry) && entry[0] === "DedraSDKWrapper",
          );
          if (!Array.isArray(sdk) || !Array.isArray(sdk[16]) || typeof sdk[16][0] !== "number")
            throw new Error("DedraSDKWrapper SDK flag was not set");
          const output = join(taskContext.workspace.root, "packaged", taskContext.step.id);
          await mkdir(output, { recursive: true });
          await writeFile(join(output, "data.json"), JSON.stringify(inputData));
          electronInputs.push({ id: taskContext.step.id, path: input, value: sdk[16][0], output });
          taskContext.setArtifact("electron-build", output);
          return { output };
        },
      };
      vi.stubEnv("PATH", "");
      for (const key of [
        "PIPELAB_RUN_ID",
        "PIPELAB_WORKFLOW_ID",
        "PIPELAB_PROJECT_ID",
        "PIPELAB_BUILD_PROFILE_ID",
        "PIPELAB_ARTIFACT_DIR",
        "PIPELAB_RELEASE_VERSION",
      ]) {
        vi.stubEnv(key, `inherited-${key}`);
      }
      let result: WorkflowResult;
      try {
        result = await runWorkflow(workflow, {
          host: createLocalHost(workspace),
          variables: { workspace, buildStaging },
          tasks,
          services: hookServices(
            workspace,
            "construct-sdk-run",
            config.id,
            config.project,
            "1.2.3",
          ),
          onEvent: (event) => {
            if (event.type === "step.log") logMessages.push(event.message);
          },
        });
      } finally {
        vi.unstubAllEnvs();
      }

      expect(result.status).toBe("completed");
      expect(constructExportCount).toBe(1);
      expect(electronInputs).toHaveLength(2);
      expect(electronInputs.map((item) => item.value).sort()).toEqual([0, 1]);
      expect(logMessages.some((message) => message.includes("MANAGED_PNPM"))).toBe(true);
      expect(new Set(electronInputs.map((item) => item.path)).size).toBe(2);
      expect(electronInputs.map((item) => item.id).sort()).toEqual([
        "sdk-off-windows-x64",
        "sdk-on-windows-x64",
      ]);
      for (const input of electronInputs) {
        const runtime = JSON.parse(await readFile(join(input.path, "runtime.json"), "utf8")) as {
          runtime: Record<string, string>;
          cwd: string;
          dirname: string;
        };
        expect(runtime).toEqual({
          runtime: {
            PIPELAB_RUN_ID: "construct-sdk-run",
            PIPELAB_WORKFLOW_ID: config.id,
            PIPELAB_PROJECT_ID: config.project,
            PIPELAB_BUILD_PROFILE_ID: input.id.startsWith("sdk-off") ? "sdk-off" : "sdk-on",
            PIPELAB_ARTIFACT_DIR: input.path,
            PIPELAB_RELEASE_VERSION: "1.2.3",
          },
          cwd: input.path,
          dirname: input.path,
        });
      }
      const packagedValues = await Promise.all(
        electronInputs.map(async ({ output }) => {
          const packaged = JSON.parse(await readFile(join(output, "data.json"), "utf8")) as {
            project: unknown[];
          };
          const packagedWrapper = packaged.project[3];
          if (!Array.isArray(packagedWrapper)) throw new Error("Packaged SDK entry is missing");
          const packagedSdk = packagedWrapper.find(
            (entry) => Array.isArray(entry) && entry[0] === "DedraSDKWrapper",
          );
          if (!Array.isArray(packagedSdk) || !Array.isArray(packagedSdk[16]))
            throw new Error("Packaged SDK flag is missing");
          return packagedSdk[16][0];
        }),
      );
      expect(packagedValues.sort()).toEqual([0, 1]);
      expect(workflow.steps.filter((step) => step.uses === "@pipelab/core/fs/copy")).toHaveLength(
        2,
      );
      for (const profileId of ["sdk-off", "sdk-on"]) {
        const copy = workflow.steps.find((step) => step.id === `release-hook-copy-${profileId}`);
        const hook = workflow.steps.find((step) =>
          step.id.startsWith(`release-before-build-${profileId}-`),
        );
        const electron = workflow.steps.find((step) => step.id === `${profileId}-windows-x64`);
        expect(copy?.needs).toContain(extraction?.id);
        expect(copy?.artifactInputs?.from).toEqual({
          stepId: extraction?.id,
          artifact: "output",
        });
        expect(hook?.needs).toEqual([copy?.id]);
        expect(electron?.artifactInputs?.["input-folder"]).toEqual({
          stepId: hook?.id,
          artifact: "output",
        });
        expect(electron?.needs).toContain(hook?.id);
      }
      expect(
        logMessages.some(
          (message) => message.includes("Input artifact:") && message.includes(buildStaging),
        ),
      ).toBe(true);
      expect(JSON.parse(await readFile(join(exportedFolder, "data.json"), "utf8"))).toEqual(
        originalData,
      );
      expect(await readFile(savedWorkflowPath, "utf8")).not.toContain("PIPELAB_");
      expect(JSON.stringify(result)).not.toContain("PIPELAB_");
      expect(JSON.parse(await readFile(join(workspace, "data.json"), "utf8"))).toEqual(
        originalData,
      );
      expect(await readFile(projectFile, "utf8")).toBe("original Construct project");
      expect(
        result.artifacts.filter(
          (artifact) => "descriptor" in artifact && artifact.artifact === "electron-build",
        ),
      ).toHaveLength(2);
    },
    30 * 60 * 1000,
  );

  test(
    "fails the Electron branch on a hook error and cancels a running hook process",
    async () => {
      sandbox = await createSandbox("release-before-build-hook-lifecycle");
      const input = join(sandbox.paths.input, "web-input");
      const workspace = join(sandbox.path, "workflow-workspace");
      const buildStaging = join(sandbox.paths.output, "workflow-staging");
      await mkdir(input, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await mkdir(buildStaging, { recursive: true });
      await writeFile(join(input, "data.json"), JSON.stringify({ project: [] }));
      await writeFile(
        join(input, "setSDKEnabled.js"),
        'if (process.argv[2] !== "0" && process.argv[2] !== "1") throw new Error("SDK flag must be 0 or 1");',
      );

      const makeWorkflow = (id: string, command: string) => {
        const config: ReleaseConfig = {
          version: RELEASE_CONFIG_VERSION,
          id,
          project: "main",
          name: id,
          source: {
            provider: "@pipelab/core/source/web-folder",
            config: { path: input },
          },
          builds: [
            {
              id: "electron-profile",
              type: "desktop",
              engine: "@pipelab/plugin-electron/producer",
              enabled: true,
              config: {},
              targets: [{ id: "windows-x64", enabled: true, config: {} }],
              beforeBuild: [
                {
                  id: "run-script",
                  enabled: true,
                  command,
                },
              ],
            },
          ],
          destinations: [],
        };
        const registry = buildCoreReleaseRegistry();
        const context = {
          host: { platform: process.platform, architecture: process.arch },
        };
        const plan = planRelease(config, registry, context);
        expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        return compileReleasePlan(config, plan, registry, context);
      };

      let electronStarted = false;
      await writeFile(join(input, "fail.js"), "process.exit(2);");
      const failureWorkflow = makeWorkflow("hook-fails", "node ./fail.js");
      const tasks = {
        ...createCoreFilesystemWorkflowTasks(),
        [RELEASE_BEFORE_BUILD_TASK_ID]: releaseBeforeBuildWorkflowTask,
        "@pipelab/plugin-electron/electron:package:v2": async () => {
          electronStarted = true;
          return {};
        },
      };
      await expect(
        runWorkflow(failureWorkflow, {
          host: createLocalHost(workspace),
          variables: { workspace, buildStaging },
          tasks,
          services: hookServices(workspace, "hook-fails-run", "hook-fails", "main", "1.0.0"),
        }),
      ).rejects.toThrow("exited with code 2");
      expect(electronStarted).toBe(false);

      const waitingScript = [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'fs.writeFileSync(path.join(__dirname, "started"), "yes");',
        'console.log("HOOK_STARTED");',
        'setTimeout(() => fs.writeFileSync(path.join(__dirname, "completed"), "yes"), 30000);',
      ].join("\n");
      await writeFile(join(input, "wait.js"), waitingScript);
      const cancellationWorkflow = makeWorkflow("hook-cancelled", "node ./wait.js");
      const cancellationController = new AbortController();
      const cancellationRun = runWorkflow(cancellationWorkflow, {
        host: createLocalHost(workspace),
        variables: { workspace, buildStaging },
        tasks,
        services: hookServices(workspace, "hook-cancelled-run", "hook-cancelled", "main", "1.0.0"),
        signal: cancellationController.signal,
        onEvent: (event) => {
          if (event.type === "step.log" && event.message.includes("HOOK_STARTED"))
            cancellationController.abort("test cancellation");
        },
      });

      await expect(cancellationRun).rejects.toMatchObject({ name: "AbortError" });
      expect(electronStarted).toBe(false);
      const stagedScriptDirectory = join(buildStaging, "electron-profile");
      await expect(readFile(join(stagedScriptDirectory, "started"), "utf8")).resolves.toBe("yes");
      await expect(access(join(stagedScriptDirectory, "completed"))).rejects.toThrow();
      await expect(access(join(input, "started"))).rejects.toThrow();
    },
    30 * 60 * 1000,
  );
});
