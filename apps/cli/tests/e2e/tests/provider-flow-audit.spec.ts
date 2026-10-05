import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox } from "@pipelab/test-utils";
import {
  buildCoreReleaseRegistry,
  builtInProviders,
  createCoreFilesystemWorkflowTasks,
  zipFolder,
} from "@pipelab/core-node";
import { compileReleasePlan, planRelease, type ReleaseConfig } from "@pipelab/shared";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";

const flows = [
  ["construct", "electron", "windows-x64", "steam"],
  ["construct", "electron", "windows-x64", "itch"],
  ["construct", "tauri", "windows-x64", "steam"],
  ["construct", "tauri", "windows-x64", "itch"],
  ["construct", "direct", "web", "poki"],
  ["construct", "direct", "web", "itch"],
  ["godot", "godot", "windows-x64", "steam"],
  ["godot", "godot", "windows-x64", "itch"],
  ["godot", "godot", "web", "poki"],
  ["godot", "godot", "web", "itch"],
] as const;

describe("built-in provider flow audit", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;
  afterEach(async () => {
    await sandbox?.remove();
  });

  it.each(flows)(
    "compiles and executes %s → %s (%s) → %s with mocked provider boundaries",
    async (source, engine, target, destination) => {
      sandbox = await createSandbox("provider-flow-audit");
      const project = join(sandbox.path, "project");
      const workspace = join(sandbox.path, "workspace");
      await mkdir(project, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await writeFile(join(project, "origin.txt"), source);
      await writeFile(join(project, "index.html"), "<h1>Provider audit</h1>");
      await writeFile(
        join(project, "project.godot"),
        'config_version=5\n[application]\nconfig/name="Audit"\n',
      );
      await writeFile(
        join(project, "export_presets.cfg"),
        '[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\n[preset.1]\nname="Web"\nplatform="Web"\n',
      );
      const direct = engine === "direct";
      const input = direct ? { source: true as const } : { buildId: "build", targetId: target };
      const config: ReleaseConfig = {
        version: "3.0.0",
        id: "provider-audit",
        project: "main",
        name: "Provider audit",
        source: {
          provider: `@pipelab/plugin-${source}/source`,
          config:
            source === "construct"
              ? { path: join(project, "game.c3p"), profilePath: join(project, "profile") }
              : { path: project },
        },
        builds: direct
          ? []
          : [
              {
                id: "build",
                type: target === "web" ? "web" : "desktop",
                engine: `@pipelab/plugin-${engine}/producer`,
                enabled: true,
                config: engine === "godot" ? { executable: "godot" } : {},
                targets: [
                  {
                    id: target,
                    enabled: true,
                    config:
                      engine === "godot"
                        ? { preset: target === "web" ? "Web" : "Windows Desktop" }
                        : {},
                  },
                ],
              },
            ],
        destinations: [
          {
            id: "publish",
            provider: `@pipelab/plugin-${destination}/destination`,
            enabled: true,
            config:
              destination === "steam"
                ? { accountConnectionId: "steam", appId: "123" }
                : destination === "itch"
                  ? { accountConnectionId: "itch", project: "owner/game" }
                  : { project: "game", name: "1.0", notes: "Audit" },
            slots: [
              {
                id: "slot",
                enabled: true,
                input,
                config:
                  destination === "steam"
                    ? { depotId: "456" }
                    : destination === "itch"
                      ? { channel: target }
                      : {},
              },
            ],
          },
        ],
      };
      const registry = buildCoreReleaseRegistry();
      const context = { host: { platform: "win32", architecture: "x64" } };
      const plan = planRelease(config, registry, context);
      expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      const workflow = compileReleasePlan(config, plan, registry, context);
      const registered = new Set(
        builtInProviders.flatMap((provider) => Object.keys(provider.workflowTasks ?? {})),
      );
      const tasks = createCoreFilesystemWorkflowTasks();
      const executed: string[] = [];
      for (const step of workflow.steps) {
        if (!step.uses.startsWith("@pipelab/plugin-")) continue;
        expect(registered.has(step.uses), step.uses).toBe(true);
        tasks[step.uses] = async (taskContext) => {
          executed.push(step.uses);
          if (step.uses.includes("export-construct-project")) {
            const zip = join(workspace, "construct.zip");
            await zipFolder(project, zip);
            taskContext.setArtifact("zipFile", zip);
            return { zipFile: zip };
          }
          const folder =
            taskContext.inputs["input-folder"] ??
            taskContext.inputs.folder ??
            taskContext.inputs.project;
          if (typeof folder !== "string")
            throw new Error(`Missing artifact input for ${step.uses}`);
          expect(await readFile(join(folder, "origin.txt"), "utf8")).toBe(source);
          if (step.delivery) {
            expect(taskContext.delivery?.artifact.path).toBe(folder);
            return {};
          }
          const output = join(workspace, "built");
          await mkdir(output, { recursive: true });
          await writeFile(join(output, "origin.txt"), source);
          for (const artifact of Object.keys(step.artifacts ?? {}))
            taskContext.setArtifact(artifact, output);
          return { output };
        };
      }
      const result = await runWorkflow(workflow, { host: createLocalHost(workspace), tasks });
      expect(result.status).toBe("completed");
      expect(executed).toEqual(
        workflow.steps.filter((step) => registered.has(step.uses)).map((step) => step.uses),
      );
      expect(executed.at(-1)).toBe(
        `@pipelab/plugin-${destination}/${destination === "steam" ? "steam" : destination}-upload`,
      );
    },
  );
});
