import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { getLocalCliRunner } from "./cli-runner";

describe("getLocalCliRunner", () => {
  it("resolves tsx's JavaScript entry point from Desktop instead of the platform shim", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { args } = getLocalCliRunner(projectRoot, entryPoint, "linux", "electron");

    assert.equal(
      args[0],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli"),
    );
    assert.match(args[0]!, /[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    assert.equal(args[1], entryPoint);
    assert.equal(args[2], "serve");
    assert.doesNotMatch(args[0]!, /node_modules[\\/]\.bin[\\/]tsx$/);
  });

  it("uses the installed Node runtime for the local CLI on Windows", () => {
    const result = getLocalCliRunner(undefined, "apps/cli/src/index.ts", "win32", "electron.exe");
    assert.equal(result.executable, "node.exe");
    assert.deepEqual(result.args, ["--import", "tsx", "apps/cli/src/index.ts", "serve"]);
  });

  it("uses the resolved tsx loader with Node directly on Windows", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { executable, args } = getLocalCliRunner(
      projectRoot,
      entryPoint,
      "win32",
      "electron.exe",
    );

    assert.equal(executable, "node.exe");
    assert.equal(args[0], "--import");
    assert.equal(
      args[1],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx"),
    );
    assert.equal(args[2], entryPoint);
    assert.equal(args[3], "serve");
  });
});
