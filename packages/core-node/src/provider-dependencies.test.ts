import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PipelabContext } from "./context";
import type { ProviderHostContext } from "@pipelab/plugin-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?tsx?$/.test(path) ? [path] : [];
  });

describe("provider dependency direction", () => {
  it.each(["packages/providers", "plugins/plugin-core"])("%s has no host dependency", (folder) => {
    const manifest = JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8"));
    expect(manifest.dependencies).not.toHaveProperty("@pipelab/core-node");
    for (const file of sourceFiles(join(root, folder, "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /(?:from\s*|import\s*\()\s*["']@pipelab\/core-node/,
      );
    }
  });

  it("the host implements the structural provider context", () => {
    const context: ProviderHostContext = new PipelabContext({ userDataPath: "/tmp/provider-host" });
    expect(context.getCachePath("pacote")).toBe("/tmp/provider-host/cache/pacote");
    expect(context.ensureNodeJS).toBeTypeOf("function");
    expect(context.ensurePNPM).toBeTypeOf("function");
    expect(context.resolveBundledAsset).toBeTypeOf("function");
  });
});
