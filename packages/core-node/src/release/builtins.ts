import {
  transformArtifactDescriptor,
  type CompiledArtifact,
  type PluginReleaseDefinition,
  type ReleaseDestinationDefinition,
  type ReleaseProducerDefinition,
  type ReleaseSourceDefinition,
} from "@pipelab/shared";

export const CORE_WORKFLOW_TASKS = {
  copy: "filesystem:copy",
  remove: "filesystem:remove",
  zip: "filesystem:zip",
  unzip: "filesystem:unzip",
  passthrough: "@pipelab/core/passthrough",
} as const;

const folderOutput = { kind: "files", container: "directory" } as const;
const webFolderOutput = {
  kind: "application",
  platform: "web",
  container: "directory",
} as const;

const folderSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-filesystem/folder-source",
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
  id: "@pipelab/plugin-filesystem/web-folder-source",
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
  fields: [{ key: "path", type: "file", label: "ZIP path", required: true }],
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

const genericZipSource = zipSource("@pipelab/plugin-filesystem/zip-source", "ZIP", {
  kind: "files",
  container: "archive",
  format: "zip",
});
const webZipSource = zipSource("@pipelab/plugin-filesystem/web-zip-source", "Web app ZIP", {
  kind: "application",
  platform: "web",
  container: "archive",
  format: "zip",
});

const folderDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-filesystem/folder-destination",
  label: "Folder",
  accepts: {},
  fields: [{ key: "outputDir", type: "directory", label: "Output folder", required: true }],
  createDefaultConfig: () => ({ outputDir: "" }),
  validate: (destination) =>
    typeof destination.config.outputDir === "string" && destination.config.outputDir.trim()
      ? []
      : [
          {
            code: "folder.output-dir.required",
            message: "A folder destination requires an output directory.",
            severity: "error",
            path: "config.outputDir",
          },
        ],
  compile: (artifact, destination, slot) => [
    {
      id: `release-folder-${destination.id}-${slot.id}`,
      uses: CORE_WORKFLOW_TASKS.copy,
      needs: [artifact.reference.stepId],
      artifactInputs: { from: artifact.reference },
      with: {
        to: destination.config.outputDir,
        recursive: true,
        overwrite: true,
        cleanup: true,
        ...slot.config,
      },
      delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
    },
  ],
};

const zipDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-filesystem/zip-destination",
  label: "ZIP",
  accepts: { container: "directory" },
  fields: [{ key: "outputPath", type: "file", label: "ZIP output path", required: true }],
  createDefaultConfig: () => ({ outputPath: "" }),
  validate: (destination) =>
    typeof destination.config.outputPath === "string" && destination.config.outputPath.trim()
      ? []
      : [
          {
            code: "zip.output-path.required",
            message: "A ZIP destination requires an output path.",
            severity: "error",
            path: "config.outputPath",
          },
        ],
  compile: (artifact, destination, slot) => [
    {
      id: `release-zip-${destination.id}-${slot.id}`,
      uses: CORE_WORKFLOW_TASKS.zip,
      needs: [artifact.reference.stepId],
      artifactInputs: { from: artifact.reference },
      with: { to: destination.config.outputPath, ...slot.config },
      delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
    },
  ],
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

export const builtInReleaseDefinitions: PluginReleaseDefinition = {
  sources: [folderSource, webFolderSource, genericZipSource, webZipSource],
  producers: [passthroughProducer, unzipProducer],
  destinations: [folderDestination, zipDestination],
};
