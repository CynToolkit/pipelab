import { expect, test, describe, afterEach } from "vitest";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox } from "@pipelab/test-utils";
import { ensurePNPM, PipelabContext } from "@pipelab/core-node";
import { getBinName } from "@pipelab/constants";
import { electronProvider } from "@pipelab/providers";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";

const factory = electronProvider.workflowTasks["@pipelab/plugin-electron/electron:package:v2"];

describe("Electron provider host integration", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test.skipIf(process.platform !== "linux")(
    "packages isolated legacy Electron targets through one composed dependency install",
    async () => {
      sandbox = await createSandbox("electron-e2e");
      // 1. Setup a dummy project to package
      const projectToPackage = join(sandbox.path, "my-app");
      await mkdir(projectToPackage, { recursive: true });
      await writeFile(
        join(projectToPackage, "package.json"),
        JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }),
      );
      await writeFile(join(projectToPackage, "index.js"), "console.log('hello electron')");
      await writeFile(join(projectToPackage, "index.html"), "<h1>Hello Electron</h1>");

      const context = new PipelabContext({ userDataPath: join(sandbox.path, "user-data") });
      const services = {
        context,
        executables: { node: process.execPath, pnpm: await ensurePNPM(context) },
        workflowCachePath: join(sandbox.path, "cache"),
      } satisfies Parameters<typeof factory>[0];
      const node = await context.ensureNodeJS();
      services.executables.node = node;

      const targets = [
        { id: "linux-x64-first", name: "my-app-first" },
        { id: "linux-x64-second", name: "my-app-second" },
      ] as const;
      const workspacePath = join(sandbox.path, "workspace");
      await mkdir(workspacePath, { recursive: true });
      const workflow = {
        version: 1 as const,
        steps: targets.map((target, index) => ({
          id: target.id,
          uses: "@pipelab/plugin-electron/electron:package:v2",
          ...(index > 0 ? { needs: [targets[index - 1]!.id] } : {}),
          with: {
            "input-folder": projectToPackage,
            platform: "linux",
            arch: "x64",
            name: target.name,
            electronVersion: "27.3.11",
            customPackages: ["is-number@7.0.0"],
          },
          artifacts: {
            "electron-build": {
              descriptor: {
                kind: "application",
                technology: "electron",
                platform: "linux",
                architecture: "x64",
                container: "directory",
              },
            },
          },
        })),
      };
      const events: string[] = [];
      const startedAt = Date.now();
      const result = await runWorkflow(workflow, {
        host: createLocalHost(workspacePath, {
          logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
          },
        }),
        tasks: { "@pipelab/plugin-electron/electron:package:v2": factory(services) },
        services,
        onEvent: (event) => {
          if (event.type === "step.log") events.push(event.message);
        },
      });
      expect(result.status).toBe("completed");
      const measurements = [];
      const outputs = new Set<string>();
      for (const target of targets) {
        const step = result.steps[target.id]!;
        expect(step.status).toBe("completed");
        const output = step.outputs.output as string;
        outputs.add(output);
        expect(output).toContain(`${target.name}-linux-x64`);
        await expect(access(output)).resolves.not.toThrow();

        const binaryPath = join(output, getBinName(target.name, "linux"));
        await expect(access(binaryPath)).resolves.not.toThrow();
        const binary = await readFile(binaryPath);
        expect(binary.subarray(0, 4)).toEqual(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
        expect(binary.readUInt16LE(18)).toBe(62);
        const artifact = result.artifacts.find(
          (entry) => "descriptor" in entry && entry.stepId === target.id,
        );
        expect(artifact?.descriptor.architecture).toBe("x64");
        expect(artifact?.path).toBe(output);
      }
      const logText = events.join("\n");
      const installDurations = [
        ...logText.matchAll(/Electron dependency installation completed in (\d+)ms/g),
      ].map((match) => Number(match[1]));
      const installStarts = [
        ...logText.matchAll(
          /Installing Electron dependencies and custom packages in one pnpm invocation/g,
        ),
      ];
      expect(installStarts).toHaveLength(2);
      expect(installDurations).toHaveLength(2);
      measurements.push({
        targets: targets.map(({ id }) => id),
        wallMs: Date.now() - startedAt,
        pnpmOperations: installStarts.length,
        pnpmMs: installDurations.reduce((sum, duration) => sum + duration, 0),
        packageReuse: logText.split("\n").filter((line) => /reused|downloaded|added/i.test(line)),
      });
      expect(outputs.size).toBe(2);
      console.log("ELECTRON_BENCHMARK", JSON.stringify(measurements));
    },
    30 * 60 * 1000,
  ); // 30 minutes timeout for real build
});
