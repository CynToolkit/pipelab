import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReleaseConfig } from "@pipelab/shared";
import {
  readRequestedWorkflowEnvironment,
  readWorkflowEnvironmentForWorkflow,
} from "./workflow-environment";

describe("readRequestedWorkflowEnvironment", () => {
  it("returns only named values from the initiating Desktop process", () => {
    assert.deepEqual(
      readRequestedWorkflowEnvironment(
        ["BUILD_VERSION", "PUBLISH_TOKEN", "BUILD_VERSION"],
        ["BUILD_VERSION", "PUBLISH_TOKEN"],
        {
          BUILD_VERSION: "2.5.0",
          PUBLISH_TOKEN: "desktop-secret",
          UNRELATED_SECRET: "must-not-be-returned",
        },
      ),
      { BUILD_VERSION: "2.5.0", PUBLISH_TOKEN: "desktop-secret" },
    );
  });

  it("rejects invalid names instead of exposing arbitrary process values", () => {
    assert.throws(
      () => readRequestedWorkflowEnvironment(["PATH", "SECRET;cat"], ["PATH"], { PATH: "/bin" }),
      /Invalid workflow environment variable name/,
    );
  });

  it("rejects a valid environment name that is not bound in the saved workflow", () => {
    assert.throws(
      () => readRequestedWorkflowEnvironment(["PATH"], ["PROJECT_PATH"], { PATH: "/bin" }),
      /is not bound in this workflow/,
    );
  });

  it("omits values that are missing from the initiating process", () => {
    assert.deepEqual(readRequestedWorkflowEnvironment(["MISSING_VALUE"], ["MISSING_VALUE"], {}), {});
  });

  it("derives allowed names from the saved workflow instead of renderer-supplied names", async () => {
    const workflow: ReleaseConfig = {
      version: "3.1.0",
      id: "release-a",
      project: "project-a",
      name: "Release A",
      source: {
        provider: "source/folder",
        config: { path: "${{ env.PROJECT_PATH }}" },
      },
      builds: [],
      destinations: [],
    };
    const result = await readWorkflowEnvironmentForWorkflow(
      "release-a",
      async (id) =>
        id === "release-a" ? workflow : Promise.reject(new Error("missing")),
      (config) => {
        const path = config.source.config.path;
        return typeof path === "string" ? [path.match(/env\.([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || ""] : [];
      },
      { PROJECT_PATH: "/desktop/game", PATH: "/bin", UNRELATED_SECRET: "do-not-return" },
    );

    assert.deepEqual(result, { PROJECT_PATH: "/desktop/game" });
  });
});
