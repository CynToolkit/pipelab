export type { PipelabContext } from "@pipelab/core-node";

export * from "@pipelab/shared";

export const sleep = (duration: number) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
};
