import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileReleasePlan,
  planRelease,
  type CompiledArtifact,
  type CompiledInput,
  type ReleaseBuildProfileConfig,
  type ReleaseConfig,
  type ReleaseDestinationConfig,
  type ReleaseOutputRef,
  type ReleasePlan,
} from "@pipelab/shared";
import { CORE_WORKFLOW_TASKS, createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";
import { createCoreFilesystemWorkflowTasks } from "../workflow-tasks/filesystem";
import { extractZip } from "../utils/fs-extras";
import { buildCoreReleaseRegistry } from "./registry";

const host = { platform: "linux", architecture: "x64" };
const context = { host };
const registry = buildCoreReleaseRegistry();
const BUNDLE = "@pipelab/core/bundle";
const ZIP = "@pipelab/core/destination/zip";

const bundleProducer = () => {
  const producer = registry.producers.find((candidate) => candidate.id === BUNDLE);
  if (!producer) throw new Error(`Missing producer ${BUNDLE}`);
  return producer;
};

const webFolderSource: ReleaseConfig["source"] = {
  provider: "@pipelab/core/source/web-folder",
  config: { path: "/games/web" },
};

const sourceRef: ReleaseOutputRef = { source: true };

const desktopBuild = (id: string, engine: string, targetId: string): ReleaseBuildProfileConfig => ({
  id,
  type: "desktop",
  engine,
  enabled: true,
  input: sourceRef,
  config: {},
  targets: [{ id: targetId, enabled: true, config: {} }],
});

const electronBuild = desktopBuild("electron", "@pipelab/plugin-electron/producer", "windows-x64");
const tauriLinuxBuild = desktopBuild("tauri-linux", "@pipelab/plugin-tauri/producer", "linux-x64");
const tauriMacosBuild = desktopBuild(
  "tauri-macos",
  "@pipelab/plugin-tauri/producer",
  "macos-arm64",
);

const bundleBuild = (id: string, inputs: ReleaseOutputRef[]): ReleaseBuildProfileConfig => ({
  id,
  type: "bundle",
  engine: BUNDLE,
  enabled: true,
  inputs,
  config: {},
  targets: [{ id: "zip", enabled: true, config: {} }],
});

const threeInputs: ReleaseOutputRef[] = [
  { buildId: "electron", targetId: "windows-x64" },
  { buildId: "tauri-linux", targetId: "linux-x64" },
  { buildId: "tauri-macos", targetId: "macos-arm64" },
];

const releaseWith = (
  builds: ReleaseBuildProfileConfig[],
  destinations: ReleaseDestinationConfig[] = [],
): ReleaseConfig => ({
  version: "3.0.0",
  id: "bundle-release",
  project: "project",
  name: "Bundle release",
  source: webFolderSource,
  builds,
  destinations,
});

const errorsOf = (plan: ReleasePlan) => plan.issues.filter((issue) => issue.severity === "error");

/** One destination with a single slot that reads the bundle output. */
const bundleDestination = (
  provider: string,
  config: Record<string, unknown>,
  slotConfig: Record<string, unknown>,
): ReleaseDestinationConfig => ({
  id: "dest",
  provider,
  enabled: true,
  config,
  slots: [
    {
      id: "bundle",
      enabled: true,
      config: slotConfig,
      input: { buildId: "bundle", targetId: "zip" },
    },
  ],
});

const bundleDestinations: Array<[string, ReleaseDestinationConfig]> = [
  [ZIP, bundleDestination(ZIP, { outputPath: "/out/bundle.zip" }, {})],
  [
    "@pipelab/plugin-itch/destination",
    bundleDestination(
      "@pipelab/plugin-itch/destination",
      { accountConnectionId: "itch-account", project: "game" },
      { channel: "windows" },
    ),
  ],
  [
    "@pipelab/plugin-steam/destination",
    bundleDestination(
      "@pipelab/plugin-steam/destination",
      { accountConnectionId: "steam-account", appId: "480100", description: "" },
      { depotId: "480101" },
    ),
  ],
  [
    "@pipelab/plugin-poki/destination",
    bundleDestination(
      "@pipelab/plugin-poki/destination",
      { project: "game", name: "1.0.0", notes: "" },
      {},
    ),
  ],
];

const bundleSlot = (destination: ReleaseDestinationConfig) =>
  planRelease(
    releaseWith(
      [electronBuild, tauriLinuxBuild, tauriMacosBuild, bundleBuild("bundle", threeInputs)],
      [destination],
    ),
    registry,
    context,
  );

describe("core Bundle producer registration", () => {
  it("registers the Bundle producer as a many-input build with a ZIP output", () => {
    const producer = bundleProducer();
    expect(producer).toMatchObject({
      id: BUNDLE,
      label: "Bundle",
      planning: { mode: "build" },
      inputs: "many",
      accepts: { kind: ["application", "files"], container: ["directory", "archive"] },
      createDefaultConfig: expect.any(Function),
    });
    expect(producer.createDefaultConfig()).toEqual({});
    expect(
      producer.validate(
        {
          id: "bundle",
          provider: BUNDLE,
          enabled: true,
          targets: [],
          config: {},
        },
        context,
      ),
    ).toEqual([]);
    expect(producer.targets).toEqual([
      expect.objectContaining({
        id: "zip",
        label: "ZIP archive",
        buildType: "bundle",
        output: { kind: "files", container: "archive", format: "zip" },
      }),
    ]);
  });

  it("refuses single-input compilation because a bundle needs several inputs", () => {
    const input: CompiledArtifact = {
      reference: { stepId: "only", artifact: "output" },
      descriptor: { kind: "application", container: "directory" },
    };
    expect(() =>
      bundleProducer().compile(
        input,
        { id: "bundle", provider: BUNDLE, enabled: true, targets: [], config: {} },
        context,
      ),
    ).toThrow(/several inputs/);
  });

  it("accepts a folder-like application and rejects a non-ZIP archive on its inputs", () => {
    const producer = bundleProducer();
    expect(
      producer.acceptsWhen?.(
        { kind: "application", platform: "windows", container: "directory" },
        { host },
      ),
    ).toEqual({ accepted: true });
    expect(
      producer.acceptsWhen?.({ kind: "files", container: "archive", format: "zip" }, { host }),
    ).toEqual({ accepted: true });
    expect(
      producer.acceptsWhen?.({ kind: "files", container: "archive", format: "tar" }, { host }),
    ).toMatchObject({ accepted: false });
  });
});

describe("core Bundle planning", () => {
  it("plans a bundle of three real builds with every input and no errors", () => {
    const plan = planRelease(
      releaseWith([
        electronBuild,
        tauriLinuxBuild,
        tauriMacosBuild,
        bundleBuild("bundle", threeInputs),
      ]),
      registry,
      context,
    );
    expect(errorsOf(plan)).toEqual([]);
    const bundle = plan.producers.find((producer) => producer.provider === BUNDLE);
    expect(bundle?.inputs).toEqual([
      { producerId: "electron", outputId: "windows-x64" },
      { producerId: "tauri-linux", outputId: "linux-x64" },
      { producerId: "tauri-macos", outputId: "macos-arm64" },
    ]);
    expect(bundle?.input).toBeUndefined();
    expect(plan.outputs.find((output) => output.buildId === "bundle")?.descriptor).toEqual({
      kind: "files",
      container: "archive",
      format: "zip",
    });
  });

  it("compiles one copy step per input and one ZIP step that all of them feed", () => {
    const config = releaseWith(
      [electronBuild, tauriLinuxBuild, tauriMacosBuild, bundleBuild("bundle", threeInputs)],
      [bundleDestinations[0][1]],
    );
    const plan = planRelease(config, registry, context);
    const workflow = compileReleasePlan(config, plan, registry, context);
    const bundleSteps = workflow.steps.filter((step) => step.id.startsWith("bundle-"));

    expect(bundleSteps.map((step) => step.id)).toEqual([
      "bundle-input-electron-windows-x64",
      "bundle-input-tauri-linux-linux-x64",
      "bundle-input-tauri-macos-macos-arm64",
      "bundle-output",
    ]);
    const workspaceStaging = "${{ variables.workspace }}/bundle-staging";
    expect(bundleSteps.slice(0, 3)).toEqual([
      {
        id: "bundle-input-electron-windows-x64",
        uses: CORE_WORKFLOW_TASKS.copy,
        needs: ["electron-windows-x64"],
        artifactInputs: { from: { stepId: "electron-windows-x64", artifact: "electron-build" } },
        with: {
          to: `${workspaceStaging}/electron-windows-x64`,
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
      },
      expect.objectContaining({
        id: "bundle-input-tauri-linux-linux-x64",
        needs: ["tauri-linux-linux-x64"],
        with: expect.objectContaining({
          to: `${workspaceStaging}/tauri-linux-linux-x64`,
        }),
      }),
      expect.objectContaining({
        id: "bundle-input-tauri-macos-macos-arm64",
        needs: ["tauri-macos-macos-arm64"],
        with: expect.objectContaining({
          to: `${workspaceStaging}/tauri-macos-macos-arm64`,
        }),
      }),
    ]);
    expect(bundleSteps[3]).toMatchObject({
      id: "bundle-output",
      uses: CORE_WORKFLOW_TASKS.zip,
      needs: [
        "bundle-input-electron-windows-x64",
        "bundle-input-tauri-linux-linux-x64",
        "bundle-input-tauri-macos-macos-arm64",
      ],
      with: {
        from: workspaceStaging,
        to: "${{ variables.workspace }}/bundle.zip",
      },
      artifacts: { output: { descriptor: { kind: "files", container: "archive", format: "zip" } } },
    });
    expect(workflow.steps.find((step) => step.id === "bundle-output")).toBeDefined();
  });

  it("plans a nested bundle (a bundle of a bundle) without errors", () => {
    const config = releaseWith(
      [
        electronBuild,
        tauriLinuxBuild,
        bundleBuild("inner", [
          { buildId: "electron", targetId: "windows-x64" },
          { buildId: "tauri-linux", targetId: "linux-x64" },
        ]),
        bundleBuild("outer", [
          { buildId: "inner", targetId: "zip" },
          { buildId: "tauri-linux", targetId: "linux-x64" },
        ]),
      ],
      [
        {
          id: "dest",
          provider: ZIP,
          enabled: true,
          config: { outputPath: "/out/outer.zip" },
          slots: [
            {
              id: "bundle",
              enabled: true,
              config: {},
              input: { buildId: "outer", targetId: "zip" },
            },
          ],
        },
      ],
    );
    const plan = planRelease(config, registry, context);
    expect(errorsOf(plan)).toEqual([]);
    const workflow = compileReleasePlan(config, plan, registry, context);
    expect(workflow.steps.find((step) => step.id === "outer-output")?.needs).toEqual([
      "outer-input-inner-zip",
      "outer-input-tauri-linux-linux-x64",
    ]);
  });

  it.each([
    [ZIP, true],
    ["@pipelab/plugin-itch/destination", true],
    ["@pipelab/plugin-steam/destination", false],
    ["@pipelab/plugin-poki/destination", false],
  ] as const)("destination %s accepts the bundle output: %s", (provider, accepted) => {
    const destination = bundleDestinations.find(([candidate]) => candidate === provider)?.[1];
    if (!destination) throw new Error(`Missing destination fixture ${provider}`);
    const plan = bundleSlot(destination);
    const incompatible = plan.issues.filter(
      (issue) => issue.code === "release.destination.input.incompatible",
    );
    if (accepted) expect(errorsOf(plan)).toEqual([]);
    else
      expect(incompatible.map((issue) => issue.code)).toEqual([
        "release.destination.input.incompatible",
      ]);
  });

  it("ZIP destination copies the bundle archive instead of zipping it a second time", () => {
    const config = releaseWith(
      [electronBuild, tauriLinuxBuild, tauriMacosBuild, bundleBuild("bundle", threeInputs)],
      [bundleDestinations[0][1]],
    );
    const plan = planRelease(config, registry, context);
    expect(errorsOf(plan)).toEqual([]);
    const workflow = compileReleasePlan(config, plan, registry, context);
    expect(workflow.steps.filter((step) => step.id.startsWith("release-zip-"))).toEqual([
      expect.objectContaining({
        uses: CORE_WORKFLOW_TASKS.copy,
        needs: ["bundle-output"],
        with: expect.objectContaining({ to: "/out/bundle.zip", overwrite: true }),
      }),
    ]);
  });
});

describe("core Bundle execution", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  const tempRoot = async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-bundle-test-"));
    roots.push(root);
    return root;
  };

  /** A passthrough step that exposes a real directory as a compiled input artifact. */
  const fakeInput = async (
    root: string,
    stepId: string,
    descriptor: CompiledArtifact["descriptor"],
    files: Record<string, string>,
  ) => {
    const dir = join(root, stepId);
    await mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    return {
      step: {
        id: stepId,
        uses: CORE_WORKFLOW_TASKS.passthrough,
        with: { path: dir },
        artifacts: { output: { descriptor } },
      },
      artifact: {
        reference: { stepId, artifact: "output" },
        descriptor,
      },
    };
  };

  it("zips every input into one top-level folder named by its label", async () => {
    const root = await tempRoot();
    const workspace = join(root, "workspace");
    const folder = { kind: "application", platform: "windows", container: "directory" } as const;
    const inputs = [
      await fakeInput(root, "fake-windows", folder, { "game.exe": "windows" }),
      await fakeInput(root, "fake-linux", folder, { "game.bin": "linux" }),
      await fakeInput(root, "fake-mac", folder, { "game.app": "mac" }),
    ];
    const compiled = bundleProducer().compileMany?.(
      [
        {
          artifact: inputs[0].artifact,
          ref: { buildId: "windows", targetId: "x" },
          label: "win-windows",
        },
        {
          artifact: inputs[1].artifact,
          ref: { buildId: "linux", targetId: "x" },
          label: "linux-linux",
        },
        {
          artifact: inputs[2].artifact,
          ref: { buildId: "mac", targetId: "x" },
          label: "mac-macos",
        },
      ] satisfies CompiledInput[],
      { id: "bundle", provider: BUNDLE, enabled: true, targets: [], config: {} },
      context,
    );
    if (!compiled) throw new Error("Bundle producer must implement compileMany");

    const result = await runWorkflow(
      {
        version: 1,
        continueOnError: false,
        steps: [...inputs.map((input) => input.step), ...compiled.steps],
      },
      {
        host: createLocalHost(workspace),
        variables: { workspace },
        tasks: createCoreFilesystemWorkflowTasks(),
      },
    );
    expect(result.status).toBe("completed");

    const extracted = join(root, "extracted");
    await extractZip(join(workspace, "bundle.zip"), extracted);
    expect((await readdir(extracted)).sort()).toEqual(["linux-linux", "mac-macos", "win-windows"]);
    expect(await readdir(join(extracted, "win-windows"))).toContain("game.exe");
  });

  it("zips a nested bundle as one folder per inner input inside the outer ZIP", async () => {
    const root = await tempRoot();
    const workspace = join(root, "workspace");
    const folder = { kind: "application", platform: "windows", container: "directory" } as const;
    const a = await fakeInput(root, "fake-a", folder, { "a.txt": "a" });
    const b = await fakeInput(root, "fake-b", folder, { "b.txt": "b" });
    const c = await fakeInput(root, "fake-c", folder, { "c.txt": "c" });
    const compileMany = bundleProducer().compileMany;
    if (!compileMany) throw new Error("Bundle producer must implement compileMany");
    const producerContext = { host };
    const configFor = (id: string) => ({
      id,
      provider: BUNDLE,
      enabled: true,
      targets: [],
      config: {},
    });

    const inner = compileMany(
      [
        { artifact: a.artifact, ref: { buildId: "a", targetId: "x" }, label: "first" },
        { artifact: b.artifact, ref: { buildId: "b", targetId: "x" }, label: "second" },
      ],
      configFor("inner"),
      producerContext,
    );
    const innerZip = inner.artifacts.zip;
    if (!innerZip) throw new Error("Inner bundle must emit its zip artifact");
    const outer = compileMany(
      [
        { artifact: innerZip, ref: { buildId: "inner", targetId: "zip" }, label: "inner-zip" },
        { artifact: c.artifact, ref: { buildId: "c", targetId: "x" }, label: "third" },
      ],
      configFor("outer"),
      producerContext,
    );

    const result = await runWorkflow(
      {
        version: 1,
        continueOnError: false,
        steps: [a.step, b.step, c.step, ...inner.steps, ...outer.steps],
      },
      {
        host: createLocalHost(workspace),
        variables: { workspace },
        tasks: createCoreFilesystemWorkflowTasks(),
      },
    );
    expect(result.status).toBe("completed");

    const extracted = join(root, "extracted");
    await extractZip(join(workspace, "outer.zip"), extracted);
    expect((await readdir(extracted)).sort()).toEqual(["inner-zip", "third"]);
    expect((await readdir(join(extracted, "inner-zip"))).sort()).toEqual(["first", "second"]);
    expect(await readdir(join(extracted, "inner-zip", "first"))).toContain("a.txt");
  });
});
