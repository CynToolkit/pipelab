import { registerShellHandlers } from "./shell";
import { registerFsHandlers } from "./fs";
import { registerConfigHandlers } from "./config";
import { registerHistoryHandlers } from "./history";
import { registerEngineHandlers } from "./engine";
import { registerAgentsHandlers } from "./agents";

export const registerAllHandlers = () => {
  registerShellHandlers();
  registerFsHandlers();
  registerConfigHandlers();
  registerHistoryHandlers();
  registerEngineHandlers();
  registerAgentsHandlers();
};

export { registerShellHandlers } from "./shell";
export { registerFsHandlers } from "./fs";
export { registerConfigHandlers } from "./config";
export { registerHistoryHandlers } from "./history";
export { registerEngineHandlers } from "./engine";
export { registerAgentsHandlers } from "./agents";
