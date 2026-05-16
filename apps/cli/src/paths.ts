import { getDefaultUserDataPath as getCorePath } from "@pipelab/core-node";
import pkg from "../package.json" assert { type: "json" };

const isDev = process.env.NODE_ENV === "development";

export const getDefaultUserDataPath = () => {
  const mode = isDev ? "dev" : pkg.version.includes("beta") ? "beta" : "prod";
  return getCorePath(mode);
};
