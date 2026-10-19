import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocalCliRunnerArgs } from "./cli-runner";

describe("getLocalCliRunnerArgs", () => {
  it("invokes tsx through its JavaScript entry point instead of the platform shim", () => {
    const args = getLocalCliRunnerArgs("C:\\repo", "C:\\repo\\apps\\cli\\src\\index.ts");

    assert.match(args[0]!, /C:\\repo[\\/]node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    assert.equal(args[1], "C:\\repo\\apps\\cli\\src\\index.ts");
    assert.equal(args[2], "serve");
    assert.doesNotMatch(args[0]!, /node_modules[\\/]\.bin[\\/]tsx$/);
  });
});
