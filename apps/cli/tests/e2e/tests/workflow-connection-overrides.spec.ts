import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { workflowRunOptions } from "../../../src/commands/workflows";
import {
  parseWorkflowConnectionOverride,
  parseWorkflowConnectionOverrides,
} from "../../../src/commands/workflow-connection-overrides";

describe("workflow connection override parsing", () => {
  it("registers --connection as a repeatable workflow run option", () => {
    const program = new Command();
    const run = program.command("run <id>");
    workflowRunOptions.forEach((option) => run.addOption(option));

    program.parse([
      "node",
      "pipelab",
      "run",
      "release",
      "--connection",
      "publish.apiKey=env:UPLOAD_TOKEN",
      "--connection",
      "archive.bucket=nightly",
    ]);

    expect(run.opts().connection).toEqual([
      "publish.apiKey=env:UPLOAD_TOKEN",
      "archive.bucket=nightly",
    ]);
  });

  it("parses environment values and preserves repeatable option order", () => {
    expect(
      parseWorkflowConnectionOverrides([
        "publish.api_key=env:UPLOAD_API_KEY",
        "backup.bucket=env:BACKUP_BUCKET",
      ]),
    ).toEqual([
      {
        alias: "publish",
        field: "api_key",
        value: { kind: "environment", name: "UPLOAD_API_KEY" },
      },
      {
        alias: "backup",
        field: "bucket",
        value: { kind: "environment", name: "BACKUP_BUCKET" },
      },
    ]);
  });

  it("splits once at the first equals sign and preserves literal text verbatim", () => {
    expect(parseWorkflowConnectionOverride("publish.upload.channel=release=a=b ")).toEqual({
      alias: "publish",
      field: "upload.channel",
      value: { kind: "literal", value: "release=a=b " },
    });
    expect(parseWorkflowConnectionOverride("publish.secret=literal: env:NAME=a=b ")).toEqual({
      alias: "publish",
      field: "secret",
      value: { kind: "literal", value: " env:NAME=a=b " },
    });
  });

  it("treats empty and unprefixed values as literals and consumes prefixes once", () => {
    expect(parseWorkflowConnectionOverride("publish.label=")).toEqual({
      alias: "publish",
      field: "label",
      value: { kind: "literal", value: "" },
    });
    expect(parseWorkflowConnectionOverride("publish.label=nightly build ")).toEqual({
      alias: "publish",
      field: "label",
      value: { kind: "literal", value: "nightly build " },
    });
    expect(parseWorkflowConnectionOverride("publish.label=literal:literal:value")).toEqual({
      alias: "publish",
      field: "label",
      value: { kind: "literal", value: "literal:value" },
    });
    expect(parseWorkflowConnectionOverride("publish.label=literal:env:FOO")).toEqual({
      alias: "publish",
      field: "label",
      value: { kind: "literal", value: "env:FOO" },
    });
    expect(parseWorkflowConnectionOverride("release.pathField=/opt/steamworks")).toEqual({
      alias: "release",
      field: "pathField",
      value: { kind: "literal", value: "/opt/steamworks" },
    });
  });

  it.each([
    "publish.label",
    "publish=value",
    "release name.token=secret-value",
    "publish.=value",
    ".label=value",
    " .token=secret",
    "publish. =secret",
  ])("rejects malformed override targets without echoing input: %s", (input) => {
    try {
      parseWorkflowConnectionOverride(input);
      throw new Error("Expected parsing to reject this input.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("Expected alias.field=VALUE");
      expect(message).not.toContain(input);
    }
  });

  it.each(["", "BAD-NAME", "NAME WITH SPACE"])(
    "rejects invalid environment variable names without echoing input: %s",
    (name) => {
      const input = `publish.token=env:${name}`;
      try {
        parseWorkflowConnectionOverride(input);
        throw new Error("Expected parsing to reject this input.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("Invalid environment variable name");
        expect(message).not.toContain(input);
      }
    },
  );
});
