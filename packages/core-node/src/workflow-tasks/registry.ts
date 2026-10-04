import { workflowTaskRunners as construct } from "@pipelab/plugin-construct";
import { workflowTaskRunners as electron } from "@pipelab/plugin-electron";
import { workflowTaskRunners as godot } from "@pipelab/plugin-godot";
import { workflowTaskRunners as itch } from "@pipelab/plugin-itch";
import { workflowTaskRunners as poki } from "@pipelab/plugin-poki";
import { workflowTaskRunners as steam } from "@pipelab/plugin-steam";
import { workflowTaskRunners as tauri } from "@pipelab/plugin-tauri";

export const workflowTaskRunners = {
  ...construct,
  ...electron,
  ...godot,
  ...itch,
  ...poki,
  ...steam,
  ...tauri,
};
