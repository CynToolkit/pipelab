import { definePhases, type PhaseIds, type WorkflowPhaseRunner } from "@pipelab/workflow-runtime";

export const electronPhases = definePhases([
  { id: "prepare", title: "Check runtime and stage build" },
  { id: "install", title: "Install dependencies" },
  { id: "package", title: "Package executable" },
  { id: "patch", title: "Patch executable" },
] as const);

export type ElectronPhaseId = PhaseIds<typeof electronPhases>;
export type ElectronPhaseRunner = WorkflowPhaseRunner<ElectronPhaseId>;
