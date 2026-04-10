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

  if (isDev) {
    // Only import Netlify in dev mode if possible, but for simplicity in a bundled app, 
    // we can import it statically if we want it available.
    // However, if we want to KEEP it dynamic for dev, it might still crash if run in dev via pkg (unlikely).
    // Let's make it static too to be safe, or just exclude it if not needed in CLI.
    const pluginNetlify = (await import("@pipelab/plugin-netlify")).default;
    base.push(pluginNetlify);
  }

  return (await Promise.all([...base])).flat();
};
