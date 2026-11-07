import { CORE_WORKFLOW_TASKS } from "@pipelab/workflow-runtime";
import type {
  ArtifactDescriptor,
  Availability,
  CompiledArtifact,
  ReleaseCompileContext,
  ReleaseProducerConfig,
  ReleaseProducerDefinition,
} from "@pipelab/shared";
import type { WorkflowStep } from "@pipelab/workflow-runtime";
import { constructExportInputs } from "./export-inputs";

type ConstructExportType = "web" | "webview2" | "wkwebview" | "cef";

const desktopUnavailable: Availability = {
  available: false,
  reason: "Construct desktop exports are not available yet",
};

const constructTargets: Array<{
  id: string;
  buildType: "web" | "desktop";
  exportType: ConstructExportType;
  output: ArtifactDescriptor;
  isAvailable: () => Availability;
}> = [
  {
    id: "web",
    buildType: "web",
    exportType: "web",
    output: {
      kind: "application",
      technology: "construct",
      platform: "web",
      container: "directory",
    },
    isAvailable: () => ({ available: true }),
  },
  {
    id: "webview2-windows-x64",
    buildType: "desktop",
    exportType: "webview2",
    output: {
      kind: "application",
      technology: "webview2",
      platform: "windows",
      architecture: "x64",
      container: "directory",
    },
    isAvailable: () => desktopUnavailable,
  },
  {
    id: "wkwebview-macos-arm64",
    buildType: "desktop",
    exportType: "wkwebview",
    output: {
      kind: "application",
      technology: "wkwebview",
      platform: "macos",
      architecture: "arm64",
      container: "directory",
    },
    isAvailable: () => desktopUnavailable,
  },
  {
    id: "cef-linux-x64",
    buildType: "desktop",
    exportType: "cef",
    output: {
      kind: "application",
      technology: "cef",
      platform: "linux",
      architecture: "x64",
      container: "directory",
    },
    isAvailable: () => desktopUnavailable,
  },
];

export const constructProducer: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-construct/producer",
  label: "Construct",
  planning: { mode: "build" },
  accepts: { kind: "project", technology: "construct" },
  targets: constructTargets.map((target) => ({
    id: target.id,
    label: target.id,
    buildType: target.buildType,
    output: target.output,
    createDefaultConfig: () => ({}),
    isAvailable: target.isAvailable,
  })),
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (
    _input: CompiledArtifact,
    config: ReleaseProducerConfig,
    context: ReleaseCompileContext,
  ) => {
    if (!context.sourceConfig)
      throw new Error("Construct export requires a Construct project source.");
    const sourceConfig = context.sourceConfig;
    const steps: WorkflowStep[] = [];
    const artifacts: Record<string, CompiledArtifact> = {};
    for (const target of config.targets.filter((item) => item.enabled)) {
      const definition = constructTargets.find((item) => item.id === target.id);
      if (!definition) throw new Error(`Unknown Construct target: ${target.id}`);
      const exportId = `${config.id}-${target.id}-export`;
      const extractId = `${config.id}-${target.id}-extract`;
      steps.push(
        {
          id: exportId,
          uses: "@pipelab/plugin-construct/export-construct-project",
          with: { ...constructExportInputs(sourceConfig), exportType: definition.exportType },
          artifacts: {
            zipFile: {
              descriptor: {
                kind: "files",
                technology: "construct",
                container: "archive",
                format: "zip",
              },
            },
          },
        },
        {
          id: extractId,
          uses: CORE_WORKFLOW_TASKS.unzip,
          needs: [exportId],
          artifactInputs: { file: { stepId: exportId, artifact: "zipFile" } },
          artifacts: { output: { descriptor: definition.output } },
        },
      );
      artifacts[target.id] = {
        reference: { stepId: extractId, artifact: "output" },
        descriptor: definition.output,
      };
    }
    return { steps, artifacts };
  },
};
