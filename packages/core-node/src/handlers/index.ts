import { registerShellHandlers } from "./shell";
import { registerFsHandlers } from "./fs";
import { registerConfigHandlers } from "./config";
import { registerHistoryHandlers } from "./history";
import { registerEngineHandlers } from "./engine";
import { registerAgentsHandlers } from "./agents";
import { registerAuthHandlers } from "./auth";
import { registerSystemHandlers } from "./system";
import { registerPluginsHandlers } from "./plugins";
import { registerMigrationHandlers } from "./migration";
import { registerWorkflowHandlers } from "./workflow";
import { builtInPlugins } from "../plugins-registry";
import { PipelabContext } from "../context";

export const registerAllHandlers = async (options: {
  version: string;
  context: PipelabContext;
  waitForPlugins?: boolean;
}) => {
  const context = options.context;
  const pluginsPromise = builtInPlugins({
    context,
  });

  registerShellHandlers(context);
  registerFsHandlers(context);
  registerConfigHandlers(context);
  registerHistoryHandlers(context);
  registerEngineHandlers(context);
  registerWorkflowHandlers(context, pluginsPromise);
  registerAgentsHandlers(context);
  registerAuthHandlers(context);
  registerSystemHandlers(options);
  registerPluginsHandlers(context);
  registerMigrationHandlers(context);

  if (options.waitForPlugins) {
    await pluginsPromise;
  }
};

export { registerShellHandlers } from "./shell";
export { registerFsHandlers } from "./fs";
export { registerConfigHandlers } from "./config";
export { registerHistoryHandlers } from "./history";
export { registerEngineHandlers } from "./engine";
export { registerAgentsHandlers } from "./agents";
export { BuildHistoryStorage } from "./build-history";
export { registerWorkflowHandlers } from "./workflow";
