import { createNodeDefinition } from "@pipelab/plugin-core";
import { ListFilesAction, ListFilesActionRun } from "./list-files";
import { isFileCondition, isFileRunner } from "./is-file";
import { zipRunner, zip } from "./zip";
import { zipV2Runner, zipV2 } from "./zip-v2";
import { unzipRunner, unzip } from "./unzip";
import { copy, copyRunner } from "./copy";
import { remove, removeRunner } from "./remove";
import { run, runRunner } from "./run";
import { openInExplorer, openInExplorerRunner } from "./open";

export default createNodeDefinition({
  description: "Filesystem",
  id: "filesystem",
  name: "Filesystem",
  icon: {
    type: "icon",
    icon: "mdi-folder-zip-outline",
  },
  nodes: [
    // {
    //     node: ListFilesAction,
    //     runner: ListFilesActionRun
    // },
    // {
    //     node: isFileCondition,
    //     runner: isFileRunner
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
