import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSandbox } from "@pipelab/test-utils";
import {
  buildCoreReleaseRegistry,
  createPipelabWorkflowTasks,
  extractZip,
  PipelabContext,
  type ProviderServices,
} from "@pipelab/core-node";
import { compileReleasePlan, planRelease, type ReleaseProducerDefinition } from "@pipelab/shared";
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";

vi.mock("../../../../../packages/core-node/src/pipelab-cloud-auth.ts", () => ({
  createPipelabCloudAuthClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: "integration-access-token",
            user: { is_anonymous: false },
          },
        },
        error: null,
      }),
    },
  }),
}));

const output = (container: "file" | "directory") => ({
  kind: "application" as const,
  platform: "fixture",
  container,
});

const fixtureProducer: ReleaseProducerDefinition = {
  id: "@pipelab/test/cloud-fixture",
  label: "Cloud fixture",
  accepts: { kind: "application", platform: "web", container: "directory" },
  planning: { mode: "build" },
  targets: [
    {
      id: "file",
      label: "File",
      buildType: "desktop",
      output: output("file"),
      createDefaultConfig: () => ({}),
    },
    {
      id: "folder",
      label: "Folder",
      buildType: "desktop",
      output: output("directory"),
      createDefaultConfig: () => ({}),
    },
    {
      id: "local-only",
      label: "Local only",
      buildType: "desktop",
      output: output("directory"),
      createDefaultConfig: () => ({}),
    },
    {
      id: "quota",
      label: "Quota failure",
      buildType: "desktop",
      output: output("file"),
      createDefaultConfig: () => ({}),
    },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => {
    const targets = config.targets.filter((target) => target.enabled);
    return {
      steps: targets.map((target) => ({
        id: `${config.id}-${target.id}`,
        uses: "test:cloud-fixture",
        needs: [input.reference.stepId],
        artifactInputs: { "input-folder": input.reference },
        with: { targetId: target.id },
        artifacts: {
          output: {
            descriptor: fixtureProducer.targets.find((candidate) => candidate.id === target.id)!
              .output!,
          },
        },
      })),
      artifacts: Object.fromEntries(
        targets.map((target) => [
          target.id,
          {
            reference: { stepId: `${config.id}-${target.id}`, artifact: "output" },
            descriptor: fixtureProducer.targets.find((candidate) => candidate.id === target.id)!
              .output!,
          },
        ]),
      ),
    };
  },
};

const cloudDestination = (id: string, targetId: string) => ({
  id,
  provider: "@pipelab/pipelab-cloud/destination",
  enabled: true,
  config: {},
  slots: [
    { id: targetId, enabled: true, input: { buildId: "cloud-profile", targetId }, config: {} },
  ],
});

describe("Pipelab Cloud Release destination in the CLI workflow host", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await sandbox?.remove();
    sandbox = undefined;
  });

  test(
    "uploads selected files and folders, keeps other outputs local, and reports quota failure",
    async () => {
      sandbox = await createSandbox("pipelab-cloud-release");
      vi.stubEnv("PIPELAB_CLOUD_WORKER_URL", "https://cloud.test");

      const source = join(sandbox.paths.input, "web");
      const workspace = join(sandbox.path, "workflow-workspace");
      const localDestination = join(sandbox.paths.output, "local-only");
      const folderExtraction = join(sandbox.path, "uploaded-folder");
      const fileContent = Buffer.from([0, 1, 2, 255, 10]);
      const storage = new Map<string, Buffer>();
      const uploadRequests: Array<Record<string, unknown>> = [];
      await mkdir(source, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await writeFile(join(source, "index.html"), "fixture source");

      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (input, init) => {
          const url = String(input);
          if (url === "https://cloud.test/") {
            const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
            if (request.action === "prepareUpload") {
              uploadRequests.push(request);
              if (request.buildTargetId === "quota") {
                return new Response(
                  JSON.stringify({ error: "Pipelab Cloud storage quota exceeded" }),
                  {
                    status: 413,
                  },
                );
              }
              return new Response(
                JSON.stringify({
                  reservationId:
                    request.buildTargetId === "file"
                      ? "11111111-1111-4111-8111-111111111111"
                      : "22222222-2222-4222-8222-222222222222",
                  uploadUrl: `https://storage.test/${String(request.buildTargetId)}`,
                  headers: {},
                }),
                { status: 200 },
              );
            }
            if (request.action === "completeUpload") {
              return new Response(
                JSON.stringify({
                  artifact: {
                    id: "33333333-3333-4333-8333-333333333333",
                    uploaded_at: "2026-10-26T00:00:00.000Z",
                  },
                }),
                { status: 200 },
              );
            }
            throw new Error(`Unexpected Cloud worker action: ${String(request.action)}`);
          }

          if (url.startsWith("https://storage.test/")) {
            const body = init?.body;
            const chunks: Buffer[] = [];
            if (body && typeof body === "object" && Symbol.asyncIterator in body) {
              for await (const chunk of body as AsyncIterable<Uint8Array>) {
                chunks.push(Buffer.from(chunk));
              }
            } else if (typeof body === "string") {
              chunks.push(Buffer.from(body));
            }
            storage.set(url.slice("https://storage.test/".length), Buffer.concat(chunks));
            return new Response(null, { status: 200 });
          }

          throw new Error(`Unexpected fetch URL: ${url}`);
        }),
      );

      const registry = buildCoreReleaseRegistry();
      registry.producers.push(fixtureProducer);
      const config = {
        version: "3.1.0" as const,
        id: "cloud-fixture-release",
        project: "cloud-project",
        name: "Cloud fixture release",
        continueOnError: true,
        source: { provider: "@pipelab/core/source/web-folder", config: { path: source } },
        builds: [
          {
            id: "cloud-profile",
            type: "desktop",
            engine: fixtureProducer.id,
            enabled: true,
            config: {},
            targets: fixtureProducer.targets.map((target) => ({
              id: target.id,
              enabled: true,
              config: {},
            })),
          },
        ],
        destinations: [
          cloudDestination("cloud-file", "file"),
          cloudDestination("cloud-folder", "folder"),
          cloudDestination("cloud-quota", "quota"),
          {
            id: "local-copy",
            provider: "@pipelab/core/destination/folder",
            enabled: true,
            config: { outputDir: localDestination },
            slots: [
              {
                id: "local-only",
                enabled: true,
                input: { buildId: "cloud-profile", targetId: "local-only" },
                config: {},
              },
            ],
          },
        ],
      };
      const context = { host: { platform: process.platform, architecture: process.arch } };
      const plan = planRelease(config, registry, context);
      expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      const workflow = compileReleasePlan(config, plan, registry, context);
      const cloudStep = workflow.steps.find((step) => step.id === "pipelab-cloud-cloud-file-file");
      expect(cloudStep?.with).toMatchObject({
        buildProfileId: "cloud-profile",
        buildTargetId: "file",
      });

      const services: ProviderServices = {
        context: new PipelabContext({ userDataPath: sandbox.paths.userData }),
        executables: { node: process.execPath, pnpm: process.execPath },
        run: {
          id: "cloud-run",
          workflowId: config.id,
          projectId: config.project,
          releaseVersion: "1.0.0",
        },
        workflowCachePath: workspace,
      };
      const tasks = createPipelabWorkflowTasks(services, {});
      tasks["test:cloud-fixture"] = async ({ step, workspace: taskWorkspace, setArtifact }) => {
        const targetId = String(step.with?.targetId);
        const targetPath = join(taskWorkspace.root, targetId);
        if (targetId === "file" || targetId === "quota") {
          await writeFile(targetPath, targetId === "file" ? fileContent : "quota fixture");
        } else {
          await mkdir(targetPath, { recursive: true });
          await writeFile(join(targetPath, `${targetId}.txt`), `${targetId} output`);
        }
        setArtifact("output", targetPath);
        return { output: targetPath };
      };

      const result = await runWorkflow(workflow, {
        host: createLocalHost(workspace),
        version: "1.0.0",
        variables: { workspace },
        tasks,
      });

      expect(uploadRequests.map((request) => request.buildTargetId).sort()).toEqual([
        "file",
        "folder",
        "quota",
      ]);
      expect(uploadRequests.find((request) => request.buildTargetId === "file")?.artifactKind).toBe(
        "file",
      );
      expect(
        uploadRequests.find((request) => request.buildTargetId === "folder")?.artifactKind,
      ).toBe("directory");
      expect(storage.get("file")).toEqual(fileContent);
      expect(storage.get("folder")?.subarray(0, 2).toString()).toBe("PK");
      await expect(readFile(join(localDestination, "local-only.txt"), "utf8")).resolves.toBe(
        "local-only output",
      );
      expect(result.status).toBe("completed-with-errors");
      expect(result.steps["pipelab-cloud-cloud-quota-quota"]?.error?.message).toBe(
        "Pipelab Cloud storage quota exceeded",
      );
      expect(result.deliveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ destinationId: "cloud-file", status: "completed" }),
          expect.objectContaining({ destinationId: "cloud-folder", status: "completed" }),
          expect.objectContaining({ destinationId: "cloud-quota", status: "failed" }),
          expect.objectContaining({ destinationId: "local-copy", status: "completed" }),
        ]),
      );

      const uploadedFolder = join(sandbox.path, "folder.zip");
      await writeFile(uploadedFolder, storage.get("folder")!);
      await extractZip(uploadedFolder, folderExtraction);
      await expect(readFile(join(folderExtraction, "folder.txt"), "utf8")).resolves.toBe(
        "folder output",
      );
      await expect(readFile(join(workspace, "file"))).resolves.toEqual(fileContent);
      await expect(readFile(join(workspace, "folder", "folder.txt"), "utf8")).resolves.toBe(
        "folder output",
      );
    },
    30 * 60 * 1000,
  );
});
