import { registerShellHandlers } from "./shell";
import { registerFsHandlers } from "./fs";
import { registerConfigHandlers } from "./config";
import { registerHistoryHandlers } from "./history";
import { registerEngineHandlers } from "./engine";
import { registerAgentsHandlers } from "./agents";
import { registerAuthHandlers } from "./auth";
import { registerSystemHandlers } from "./system";
import { builtInPlugins } from "../plugins-registry";
import { usePlugins } from "@pipelab/shared";

export const registerAllHandlers = async (options: { version: string }) => {
  registerShellHandlers();
  registerFsHandlers();
  registerConfigHandlers();
  registerHistoryHandlers();
  registerEngineHandlers();
  registerAgentsHandlers();
  registerAuthHandlers();
  registerSystemHandlers(options);

  const { registerPlugins } = usePlugins();
  const plugins = await builtInPlugins();
  registerPlugins(plugins as any);
};

export { registerShellHandlers } from "./shell";
export { registerFsHandlers } from "./fs";
export { registerConfigHandlers } from "./config";
export { registerHistoryHandlers } from "./history";
export { registerEngineHandlers } from "./engine";
export { registerAgentsHandlers } from "./agents";
