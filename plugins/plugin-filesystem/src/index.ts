import { createNodeDefinition } from "@pipelab/plugin-core";
import { zipRunner, zip } from "./zip";
import { zipV2Runner, zipV2 } from "./zip-v2";
import { unzipRunner, unzip } from "./unzip";
import { copy, copyRunner } from "./copy";
import { remove, removeRunner } from "./remove";
import { run, runRunner } from "./run";
import { openInExplorer, openInExplorerRunner } from "./open";
import {
  transformArtifactDescriptor,
  type CompiledArtifact,
  type ReleaseDestinationDefinition,
  type ReleaseProducerDefinition,
  type ReleaseSourceDefinition,
} from "@pipelab/shared";

const folderSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-filesystem/folder-source",
  label: "Folder",
  fields: [{ key: "path", type: "directory", label: "Folder path", required: true }],
  output: { kind: "files", container: "directory" },
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) =>
    typeof config.path === "string" && config.path
      ? []
      : [
          {
            code: "source.path.required",
            message: "A folder path is required.",
            severity: "error",
          },
        ],
  compile: (config) => ({
    steps: [
      {
        id: "release-folder-source",
        uses: "@pipelab/plugin-filesystem/fs:copy",
        with: {
          from: config.path,
          to: "${{ variables.workspace }}/source",
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
        artifacts: { output: { descriptor: folderSource.output } },
      },
    ],
    artifact: {
      reference: { stepId: "release-folder-source", artifact: "output" },
      descriptor: folderSource.output,
    },
  }),
};

const webFolderSource: ReleaseSourceDefinition = {
  ...folderSource,
  id: "@pipelab/plugin-filesystem/web-folder-source",
  label: "Web app folder",
  output: { kind: "application", platform: "web", container: "directory" },
  compile: (config) => ({
    steps: [
      {
        id: "release-web-folder-source",
        uses: "@pipelab/plugin-filesystem/fs:copy",
        with: {
          from: config.path,
          to: "${{ variables.workspace }}/source",
          recursive: true,
          overwrite: true,
          cleanup: true,
        },
        artifacts: {
          output: { descriptor: { kind: "application", platform: "web", container: "directory" } },
        },
      },
    ],
    artifact: {
      reference: { stepId: "release-web-folder-source", artifact: "output" },
      descriptor: { kind: "application", platform: "web", container: "directory" },
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
      : [{ code: "source.path.required", message: "A ZIP path is required.", severity: "error" }],
  compile: (config) => ({
    steps: [
      {
        id: `${id}-source`,
        uses: "@pipelab/plugin-filesystem/fs:copy",
        with: { from: config.path, to: "${{ variables.workspace }}/source.zip", overwrite: true },
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

export const folderDestination: ReleaseDestinationDefinition = {
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
          },
        ],
  compile: (artifact, destination, slot) => [
    {
      id: `release-folder-${destination.id}-${slot.id}`,
      uses: "@pipelab/plugin-filesystem/fs:copy",
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

export const zipDestination: ReleaseDestinationDefinition = {
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
          },
        ],
  compile: (artifact, destination, slot) => [
    {
      id: `release-zip-${destination.id}-${slot.id}`,
      uses: "@pipelab/plugin-filesystem/zip-v2-node",
      needs: [artifact.reference.stepId],
      artifactInputs: { folder: artifact.reference },
      with: { outputPath: destination.config.outputPath, ...slot.config },
      delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
    },
  ],
};

const unzipProducer: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-filesystem/unzip",
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
          uses: "@pipelab/plugin-filesystem/unzip-file-node",
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
  id: "@pipelab/core/passthrough",
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
          uses: "@pipelab/core/passthrough",
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

export default createNodeDefinition({
  id: "@pipelab/plugin-filesystem",
  packageName: "@pipelab/plugin-filesystem",
  name: "Filesystem",
  description: "Pipelab plugin for filesystem operations (copy, move, delete, zip)",
  icon: { type: "icon", icon: "mdi-folder-zip-outline" },
  isOfficial: true,
  nodes: [
    // {
    //     node: ListFilesAction,
    //     runner: ListFilesActionRun
    // },
    {
      node: zip,
      runner: zipRunner,
    },
    {
      node: zipV2,
      runner: zipV2Runner,
    },
    {
      node: unzip,
      runner: unzipRunner,
    },
    {
      node: copy,
      runner: copyRunner,
    },
    {
      node: remove,
      runner: removeRunner,
    },
    {
      node: run,
      runner: runRunner,
    },
    {
      node: openInExplorer,
      runner: openInExplorerRunner,
    },
  ],
  release: {
    sources: [folderSource, webFolderSource, genericZipSource, webZipSource],
    producers: [passthroughProducer, unzipProducer],
    destinations: [folderDestination, zipDestination],
  },
});
