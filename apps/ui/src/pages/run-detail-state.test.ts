import { describe, expect, it } from "vitest";
import type { BuildHistoryEntry, ExecutionStep } from "@pipelab/shared";
import {
  artifactDisplayName,
  artifactDisplayDescription,
  createRunStepSelectionState,
  deliveryDisplayMetadata,
  isRunContextValid,
  autoSelectInitialRunStep,
  selectRunStep,
  resetRunStepSelectionState,
} from "./run-detail-state";

const steps: ExecutionStep[] = [
  { id: "export", name: "Export Construct project", status: "completed", startTime: 1, logs: [] },
  { id: "package", name: "Electron · Windows x64", status: "running", startTime: 2, logs: [] },
];

const entry = { pipelineId: "project-1", workflowId: "flow-1" } as BuildHistoryEntry;

describe("run detail state", () => {
  it("auto-selects an active step initially but keeps All logs after explicit selection through polling", () => {
    const state = createRunStepSelectionState();

    autoSelectInitialRunStep(state, steps);
    expect(state.selectedStepId).toBe("package");
    selectRunStep(state, null);
    autoSelectInitialRunStep(state, [{ ...steps[1], status: "completed" }]);

    expect(state.selectedStepId).toBeNull();
    resetRunStepSelectionState(state);
    autoSelectInitialRunStep(state, steps);
    expect(state.selectedStepId).toBe("package");
  });

  it("rejects run URLs whose project or workflow does not match the persisted run", () => {
    expect(isRunContextValid(entry, "flow-1", "project-1")).toBe(true);
    expect(isRunContextValid(entry, "another-flow", "project-1")).toBe(false);
    expect(isRunContextValid(entry, "flow-1", "another-project")).toBe(false);
  });

  it("uses artifact definitions and persisted destination metadata for readable labels", () => {
    const artifact = { id: "artifact", name: "electron.windows", outputId: "electron.windows", path: "/game.zip", size: 1, type: "file", producerStep: "package" } as const;
    expect(artifactDisplayName(artifact)).toBe("Windows x64");
    expect(artifactDisplayDescription(artifact, steps)).toBe("Electron · Windows x64");
    expect(deliveryDisplayMetadata({ id: "delivery", destinationId: "steam-instance", serviceId: "steam", destinationName: "Steam", slotId: "windows", artifactId: "artifact", status: "completed", startedAt: 1, completedAt: 2, duration: 1 })).toEqual({ id: "steam-instance", serviceId: "steam", name: "Steam" });
  });
});
