import {
  deploymentFolderName,
  deploymentFolderPath,
  transformArtifactDescriptor,
  type CompiledArtifact,
  type ProviderReleaseDefinition,
  type ReleaseDestinationDefinition,
  type ReleaseProducerDefinition,
  type ReleaseSourceDefinition,
} from "@pipelab/shared";
import { CORE_WORKFLOW_TASKS, type WorkflowStep } from "@pipelab/workflow-runtime";
export { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";

const folderOutput = { kind: "files", container: "directory" } as const;
const webFolderOutput = {
  kind: "application",
  platform: "web",
  container: "directory",
} as const;

/** Renames the slot's destination field to the task input it feeds; other slot config passes through. */
const slotTaskConfig = (
  slot: { config: Record<string, unknown> },
  field: string,
  input: string,
): Record<string, unknown> => {
  const { [field]: value, ...rest } = slot.config;
  return { ...rest, [input]: value };
};

const folderSource: ReleaseSourceDefinition = {
  id: "@pipelab/core/source/folder",
  label: "Folder",
  fields: [{ key: "path", type: "directory", label: "Folder path", required: true }],
  output: folderOutput,
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) =>
    typeof config.path === "string" && config.path
      ? []
      : [
          {
            code: "source.path.required",
            message: "A folder path is required.",
            severity: "error",
            path: "path",
          },
        ],
  compile: (config) => ({
    steps: [
      {
        id: "release-folder-source",
        uses: CORE_WORKFLOW_TASKS.copy,
        with: {
          from: config.path,
          to: "${{ variables.workspace }}/source",
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
        artifacts: { output: { descriptor: folderOutput } },
      },
    ],
    artifact: {
      reference: { stepId: "release-folder-source", artifact: "output" },
      descriptor: folderOutput,
    },
  }),
};

const webFolderSource: ReleaseSourceDefinition = {
  ...folderSource,
  id: "@pipelab/core/source/web-folder",
  label: "Web app folder",
  output: webFolderOutput,
  compile: (config) => ({
    steps: [
      {
        id: "release-web-folder-source",
        uses: CORE_WORKFLOW_TASKS.copy,
        with: {
          from: config.path,
          to: "${{ variables.workspace }}/source",
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
        artifacts: { output: { descriptor: webFolderOutput } },
      },
    ],
    artifact: {
      reference: { stepId: "release-web-folder-source", artifact: "output" },
      descriptor: webFolderOutput,
    },
  }),
};

const zipSource = (
  id: string,
  label: string,
  output: ReleaseSourceDefinition["output"],
): ReleaseSourceDefinition => ({
  id,
  label,
  fields: [
    { key: "path", type: "file", label: "ZIP path", required: true, fileExtensions: ["zip"] },
  ],
  output,
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) =>
    typeof config.path === "string" && config.path
      ? []
      : [
          {
            code: "source.path.required",
            message: "A ZIP path is required.",
            severity: "error",
            path: "path",
          },
        ],
  compile: (config) => ({
    steps: [
      {
        id: `${id}-source`,
        uses: CORE_WORKFLOW_TASKS.copy,
        with: {
          from: config.path,
          to: "${{ variables.workspace }}/source.zip",
          overwrite: true,
        },
        artifacts: { output: { descriptor: output } },
      },
    ],
    artifact: { reference: { stepId: `${id}-source`, artifact: "output" }, descriptor: output },
  }),
});

const genericZipSource = zipSource("@pipelab/core/source/zip", "ZIP", {
  kind: "files",
  container: "archive",
  format: "zip",
});
const webZipSource = zipSource("@pipelab/core/source/web-zip", "Web app ZIP", {
  kind: "application",
  platform: "web",
  container: "archive",
  format: "zip",
});

const folderDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/core/destination/folder",
  label: "Folder",
  icon: { type: "icon", icon: "mdi-folder-outline" },
  accepts: {},
  requiresBuild: true,
  fields: [],
  slotFields: [{ key: "outputDir", type: "directory", label: "Output folder", required: true }],
  createDefaultConfig: () => ({}),
  validate: (destination) =>
    destination.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.enabled && !String(slot.config.outputDir ?? "").trim())
      .map(({ slot, index }) => ({
        code: "folder.output-dir.required",
        message: `An output folder is required for ${slot.name?.trim() || `Deployment ${index + 1}`}.`,
        severity: "error" as const,
        path: `slots.${slot.id}.config.outputDir`,
      })),
  compile: (artifact, destination, slot) => [
    {
      id: `release-folder-${destination.id}-${slot.id}`,
      uses: CORE_WORKFLOW_TASKS.copy,
      needs: [artifact.reference.stepId],
      artifactInputs: { from: artifact.reference },
      with: {
        recursive: true,
        overwrite: true,
        cleanup: true,
        ...slotTaskConfig(slot, "outputDir", "to"),
        to: deploymentFolderPath(
          String(slot.config.outputDir),
          deploymentFolderName(slot, destination.slots.indexOf(slot)),
        ),
      },
      delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
    },
  ],
};

const zipDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/core/destination/zip",
  label: "ZIP",
  icon: { type: "icon", icon: "mdi-folder-zip-outline" },
  accepts: { container: ["directory", "archive"] },
  acceptsWhen: (artifact) =>
    artifact.container === "directory" || artifact.format === "zip"
      ? { accepted: true }
      : { accepted: false, reason: "A ZIP destination accepts folders and ZIP archives." },
  fields: [],
  slotFields: [
    {
      key: "outputPath",
      type: "file",
      label: "ZIP output path",
      required: true,
      fileExtensions: ["zip"],
      pathMode: "save",
    },
  ],
  createDefaultConfig: () => ({}),
  validate: (destination) =>
    destination.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.enabled && !String(slot.config.outputPath ?? "").trim())
      .map(({ slot, index }) => ({
        code: "zip.output-path.required",
        message: `A ZIP output path is required for ${slot.name?.trim() || `Deployment ${index + 1}`}.`,
        severity: "error" as const,
        path: `slots.${slot.id}.config.outputPath`,
      })),
  compile: (artifact, destination, slot) =>
    artifact.descriptor.container === "archive"
      ? [
          {
            // An archive is already a ZIP, so the destination copies it rather than zipping it again.
            id: `release-zip-${destination.id}-${slot.id}`,
            uses: CORE_WORKFLOW_TASKS.copy,
            needs: [artifact.reference.stepId],
            artifactInputs: { from: artifact.reference },
            with: { overwrite: true, ...slotTaskConfig(slot, "outputPath", "to") },
            delivery: {
              destinationId: destination.id,
              slotId: slot.id,
              artifact: artifact.reference,
            },
          },
        ]
      : [
          {
            id: `release-zip-${destination.id}-${slot.id}`,
            uses: CORE_WORKFLOW_TASKS.zip,
            needs: [artifact.reference.stepId],
            artifactInputs: { from: artifact.reference },
            with: slotTaskConfig(slot, "outputPath", "to"),
            delivery: {
              destinationId: destination.id,
              slotId: slot.id,
              artifact: artifact.reference,
            },
          },
        ],
};

const bundleZipOutput = { kind: "files", container: "archive", format: "zip" } as const;

/**
 * Puts every input into one ZIP with one top-level folder per input, named by its label. Folder
 * inputs are copied into a staging folder; ZIP inputs (for nested bundles) are extracted into it.
 */
const bundleProducer: ReleaseProducerDefinition = {
  id: "@pipelab/core/bundle",
  label: "Bundle",
  planning: { mode: "build" },
  inputs: "many",
  accepts: { kind: ["application", "files"], container: ["directory", "archive"] },
  acceptsWhen: (artifact) =>
    artifact.container === "directory" || artifact.format === "zip"
      ? { accepted: true }
      : { accepted: false, reason: "A bundle accepts folders and ZIP archives." },
  targets: [
    {
      id: "zip",
      label: "ZIP archive",
      buildType: "bundle",
      output: bundleZipOutput,
      createDefaultConfig: () => ({}),
    },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => {
    throw new Error("A bundle consumes several inputs; it is compiled with compileMany.");
  },
  compileMany: (inputs, config) => {
    const stagingDir = `\${{ variables.workspace }}/${config.id}-staging`;
    const archivePath = `\${{ variables.workspace }}/${config.id}.zip`;
    const stageSteps = inputs.map((input): WorkflowStep => {
      const stepId = `${config.id}-input-${input.label}`;
      const to = `${stagingDir}/${input.label}`;
      return input.artifact.descriptor.container === "archive"
        ? {
            id: stepId,
            uses: CORE_WORKFLOW_TASKS.unzip,
            needs: [input.artifact.reference.stepId],
            artifactInputs: { file: input.artifact.reference },
            with: { to },
          }
        : {
            id: stepId,
            uses: CORE_WORKFLOW_TASKS.copy,
            needs: [input.artifact.reference.stepId],
            artifactInputs: { from: input.artifact.reference },
            with: { to, recursive: true, overwrite: true, cleanup: true },
          };
    });
    const stepId = `${config.id}-output`;
    return {
      steps: [
        ...stageSteps,
        {
          id: stepId,
          uses: CORE_WORKFLOW_TASKS.zip,
          needs: stageSteps.map((step) => step.id),
          with: { from: stagingDir, to: archivePath },
          artifacts: { output: { descriptor: bundleZipOutput } },
        },
      ],
      artifacts: {
        zip: { reference: { stepId, artifact: "output" }, descriptor: bundleZipOutput },
      },
    };
  },
};

const unzipProducer: ReleaseProducerDefinition = {
  id: "@pipelab/core/unzip",
  label: "Extract ZIP",
  planning: { mode: "automatic" },
  accepts: { container: "archive", format: "zip" },
  targets: [
    {
      id: "output",
      label: "Extracted files",
      transform: { changes: { container: "directory" }, remove: ["format"] },
      createDefaultConfig: () => ({}),
    },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input: CompiledArtifact, config) => {
    const descriptor = transformArtifactDescriptor(input.descriptor, {
      container: "directory",
      format: undefined,
    });
    const stepId = `${config.id}-output`;
    return {
      steps: [
        {
          id: stepId,
          uses: CORE_WORKFLOW_TASKS.unzip,
          needs: [input.reference.stepId],
          artifactInputs: { file: input.reference },
          artifacts: { output: { descriptor } },
        },
      ],
      artifacts: { output: { reference: { stepId, artifact: "output" }, descriptor } },
    };
  },
};

const passthroughProducer: ReleaseProducerDefinition = {
  id: CORE_WORKFLOW_TASKS.passthrough,
  label: "Passthrough",
  planning: { mode: "automatic" },
  accepts: {},
  targets: [
    { id: "output", label: "Output", transform: { changes: {} }, createDefaultConfig: () => ({}) },
  ],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => {
    const stepId = `${config.id}-output`;
    return {
      steps: [
        {
          id: stepId,
          uses: CORE_WORKFLOW_TASKS.passthrough,
          needs: [input.reference.stepId],
          artifactInputs: { path: input.reference },
          artifacts: { output: { descriptor: input.descriptor } },
        },
      ],
      artifacts: {
        output: { reference: { stepId, artifact: "output" }, descriptor: input.descriptor },
      },
    };
  },
};

export const builtInReleaseDefinitions: ProviderReleaseDefinition = {
  sources: [folderSource, webFolderSource, genericZipSource, webZipSource],
  producers: [passthroughProducer, unzipProducer, bundleProducer],
  destinations: [folderDestination, zipDestination],
};
