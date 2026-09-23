import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createSandbox, runCLI } from "@pipelab/test-utils";

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
    { id: "windows", enabled: true, ...(input ? { input } : {}), config: { depotId: "456" } },
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
            provider: "@pipelab/plugin-filesystem/folder-source",
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
            provider: "@pipelab/plugin-filesystem/folder-source",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "copy-output",
              provider: "@pipelab/plugin-filesystem/folder-destination",
              enabled: true,
              config: { outputDir: destinationPath },
              slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
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
      expect(result.plan.destinations[0].slots[0].input).toEqual({ source: true });
      expect(result.workflow.steps.map((step: { id: string }) => step.id)).toEqual([
        "release-folder-source",
        "release-folder-copy-output-source",
      ]);
      await expect(access(destinationPath)).rejects.toThrow();
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
      expect(result.plan.destinations[0].slots[0].input).toEqual({ source: true });
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
      expect(result.plan.destinations[0].slots[0].input).toEqual({ source: true });
      expect(result.plan.destinations[1].slots[0].input).toMatchObject({ outputId: "windows-x64" });
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
          provider: "@pipelab/plugin-filesystem/web-zip-source",
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
