import { Block } from "@pipelab/shared";

export const walker = async (graph: Array<Block>, onNode: (node: Block) => Promise<void>) => {
  for (const node of graph) {
    if (node.type === "action") {
      await onNode(node);
    } else if (node.type === "comment") {
      await onNode(node);
    } else if (node.type === "event") {
      await onNode(node);
    }
  }
};
