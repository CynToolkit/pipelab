import { describe, expect, test } from "vitest";
import { workflowStepTitle } from "../../../src/commands/workflow-task-title";
import {
  createWorkflowTaskOutputBuffer,
  workflowTaskOutputLines,
} from "../../../src/commands/workflow-task-output";

describe("workflow CLI task titles", () => {
  test("uses readable names for source, build, and destination steps", () => {
    expect(
      workflowStepTitle({
        id: "construct-source-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
      }),
    ).toBe("Export Construct project");

    expect(
      workflowStepTitle({
        id: "desktop-default-linux-x64",
        uses: "@pipelab/plugin-electron/electron:package:v2",
      }),
    ).toBe("Build desktop app (Linux x64)");

    expect(
      workflowStepTitle({
        id: "steam-destination-G3D0FF-output",
        uses: "@pipelab/plugin-steam/steam-upload",
      }),
    ).toBe("Upload to Steam");

    expect(
      workflowStepTitle({
        id: "itch-destination-OiwcPU-output",
        uses: "@pipelab/plugin-itch/itch-upload",
      }),
    ).toBe("Upload to itch.io");

    expect(
      workflowStepTitle({
        id: "poki-destination-MIJnyG-source",
        uses: "@pipelab/plugin-poki/poki-upload",
        delivery: {
          destinationId: "MIJnyG",
          slotId: "source",
          artifact: { stepId: "build", artifact: "output" },
        },
      }),
    ).toBe("Upload to Poki");
  });

  test("uses a readable operation name for other workflow steps", () => {
    expect(
      workflowStepTitle({ id: "custom-step-42", uses: "@pipelab/plugin-example/create-release" }),
    ).toBe("Create Release");
  });

  test("splits multiline task messages into separate output lines", () => {
    expect(workflowTaskOutputLines("first line\nsecond line\r\nthird line")).toEqual([
      "first line",
      "second line",
      "third line",
    ]);
  });

  test("buffers split log chunks until a complete live line arrives", () => {
    const output = createWorkflowTaskOutputBuffer();

    expect(output.push("Checking package ")).toEqual([]);
    expect(output.push("manager version\r")).toEqual(["Checking package manager version"]);
    expect(output.push("Finalizing package")).toEqual([]);
    expect(output.flush()).toEqual(["Finalizing package"]);
    expect(output.flush()).toEqual([]);
  });

  test("keeps complete task messages separate from buffered stream chunks", () => {
    const output = createWorkflowTaskOutputBuffer();

    expect(output.pushMessage("first message")).toEqual(["first message"]);
    expect(output.pushMessage("second message")).toEqual(["second message"]);
    expect(output.push("partial ")).toEqual([]);
    expect(output.flush()).toEqual(["partial "]);
  });
});
