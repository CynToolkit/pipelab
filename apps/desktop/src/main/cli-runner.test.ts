import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { getLocalCliRunnerArgs } from "./cli-runner";

describe("getLocalCliRunnerArgs", () => {
  it("resolves tsx's JavaScript entry point from Desktop instead of the platform shim", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const args = getLocalCliRunnerArgs(projectRoot, entryPoint);

    assert.equal(
      args[0],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli"),
    );
    assert.match(args[0]!, /[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    assert.equal(args[1], entryPoint);
    assert.equal(args[2], "serve");
    assert.doesNotMatch(args[0]!, /node_modules[\\/]\.bin[\\/]tsx$/);
  });
});
