import { join } from "node:path";
import { homedir } from "node:os";
import { isDev } from "@pipelab/core-node";

export const getDefaultUserDataPath = () =>
  join(homedir(), ".config", "@pipelab", isDev ? "app-dev" : "app");
