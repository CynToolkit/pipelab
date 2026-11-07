import { describe, expect, it } from "vitest";
import { RELEASE_DEFAULTS, validateReleaseDefaults } from "@pipelab/shared";
import { buildCoreReleaseRegistry } from "./registry";

describe("RELEASE_DEFAULTS against the built-in registry", () => {
  it("has no problems", () => {
    expect(validateReleaseDefaults(RELEASE_DEFAULTS, buildCoreReleaseRegistry())).toEqual([]);
  });
});
