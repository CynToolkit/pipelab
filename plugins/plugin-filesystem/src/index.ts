import { createNodeDefinition } from "@pipelab/plugin-core";
import { ListFilesAction, ListFilesActionRun } from "./list-files";
import { zipRunner, zip } from "./zip";
import { zipV2Runner, zipV2 } from "./zip-v2";
import { unzipRunner, unzip } from "./unzip";
import { copy, copyRunner } from "./copy";
import { remove, removeRunner } from "./remove";
import { run, runRunner } from "./run";
import { openInExplorer, openInExplorerRunner } from "./open";

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
});
