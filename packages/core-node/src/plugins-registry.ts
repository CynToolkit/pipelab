import pluginConstruct from "@pipelab/plugin-construct";
import pluginFilesystem from "@pipelab/plugin-filesystem";
import pluginSystem from "@pipelab/plugin-system";
import pluginSteam from "@pipelab/plugin-steam";
import pluginItch from "@pipelab/plugin-itch";
import pluginElectron from "@pipelab/plugin-electron";
import pluginDiscord from "@pipelab/plugin-discord";
import pluginPoki from "@pipelab/plugin-poki";
import pluginNvpatch from "@pipelab/plugin-nvpatch";
import pluginTauri from "@pipelab/plugin-tauri";

const isDev = process.env.NODE_ENV === "development";

export const builtInPlugins = async () => {
  const base = [
    pluginConstruct,
    pluginFilesystem,
    pluginSystem,
    pluginSteam,
    pluginItch,
    pluginElectron,
    pluginDiscord,
    pluginPoki,
    pluginNvpatch,
    pluginTauri,
  ];

  return base.flat();
};
