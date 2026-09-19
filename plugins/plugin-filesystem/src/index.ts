import { createNodeDefinition } from "@pipelab/plugin-core";
import { ListFilesAction, ListFilesActionRun } from "./list-files";
import { zipRunner, zip } from "./zip";
import { zipV2Runner, zipV2 } from "./zip-v2";
import { unzipRunner, unzip } from "./unzip";
import { copy, copyRunner } from "./copy";
import { remove, removeRunner } from "./remove";
import { run, runRunner } from "./run";
import { openInExplorer, openInExplorerRunner } from "./open";
import type { ReleaseDestinationDefinition, ReleaseProducerDefinition, ReleaseSourceDefinition } from "@pipelab/shared";

const folderSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-filesystem/folder-source",
  label: "Folder",
  output: { kind: "application", platform: "web", format: "directory" },
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) => typeof config.path === "string" && config.path ? [] : [{ code: "source.path.required", message: "A folder path is required.", severity: "error" }],
  compile: () => ({ steps: [{ id: "release-folder-source", uses: "@pipelab/plugin-filesystem/fs:copy", with: { from: "${{ variables.sourcePath }}", to: "${{ variables.workspace }}/source" }, artifacts: { output: { descriptor: folderSource.output } } }], artifact: { reference: { stepId: "release-folder-source", artifact: "output" }, descriptor: folderSource.output } }),
};

export const folderDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-filesystem/folder-destination",
  label: "Folder",
  accepts: {},
  fields: [{ key: "outputDir", type: "directory", label: "Output folder", required: true }],
  createDefaultConfig: () => ({ outputDir: "" }),
  validate: (destination) => typeof destination.config.outputDir === "string" && destination.config.outputDir.trim() ? [] : [{ code: "folder.output-dir.required", message: "A folder destination requires an output directory.", severity: "error" }],
  compile: (artifact, destination, slot) => [{ id: `release-folder-${destination.id}-${slot.id}`, uses: "@pipelab/plugin-filesystem/fs:copy", needs: [artifact.stepId], artifactInputs: { from: artifact }, with: { to: destination.config.outputDir, recursive: true, overwrite: true, cleanup: true, ...slot.config }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }],
};

export const zipDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-filesystem/zip-destination",
  label: "ZIP",
  accepts: {},
  fields: [{ key: "outputPath", type: "file", label: "ZIP output path", required: true }],
  createDefaultConfig: () => ({ outputPath: "" }),
  validate: (destination) => typeof destination.config.outputPath === "string" && destination.config.outputPath.trim() ? [] : [{ code: "zip.output-path.required", message: "A ZIP destination requires an output path.", severity: "error" }],
  compile: (artifact, destination, slot) => [{ id: `release-zip-${destination.id}-${slot.id}`, uses: "@pipelab/plugin-filesystem/zip-v2-node", needs: [artifact.stepId], artifactInputs: { folder: artifact }, with: { outputPath: destination.config.outputPath, ...slot.config }, delivery: { destinationId: destination.id, slotId: slot.id, artifact } }],
};

const passthroughProducer: ReleaseProducerDefinition = {
  id: "@pipelab/core/passthrough",
  label: "Passthrough",
  accepts: {},
  targets: [{ id: "output", label: "Output", output: folderSource.output, createDefaultConfig: () => ({}) }],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => ({ steps: [{ id: `${config.id}-output`, uses: "@pipelab/core/passthrough", needs: [input.stepId], artifactInputs: { path: input }, artifacts: { output: { descriptor: folderSource.output } } }], artifacts: { output: { reference: { stepId: `${config.id}-output`, artifact: "output" }, descriptor: folderSource.output } } }),
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
  release: { sources: [folderSource], producers: [passthroughProducer], destinations: [folderDestination, zipDestination] },
});
