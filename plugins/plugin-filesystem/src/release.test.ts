import { describe, expect, it } from "vitest";
import filesystem from "./index";

describe("filesystem legacy compatibility", () => {
  it("keeps all saved Pipeline node IDs registered with runners", () => {
    expect(filesystem.release).toBeUndefined();
    const nodes = new Map(filesystem.nodes.map(({ node, runner }) => [node.id, runner]));
    for (const id of [
      "fs:copy",
      "fs:remove",
      "fs:run",
      "unzip-file-node",
      "zip-node",
      "zip-v2-node",
      "fs:open-in-explorer",
    ]) {
      expect(nodes.get(id)).toBeTypeOf("function");
    }
  });
});
