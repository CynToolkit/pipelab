import { ARTIFACT_OUTPUTS, type ArtifactOutputId } from "./artifacts";
import type { Workflow, WorkflowStep } from "./types";

export interface WorkflowPackagerConfiguration {
  readonly id: string;
  readonly definitionId: "electron" | "tauri" | "web";
  readonly name?: string;
  readonly enabled: boolean;
  readonly config?: Record<string, unknown>;
}

export interface WorkflowSlotConfiguration {
  readonly id: string;
  readonly enabled?: boolean;
  readonly config?: Record<string, unknown>;
  readonly input: { packagerId: string; outputId: ArtifactOutputId };
}

export interface WorkflowDestinationV2Configuration {
  readonly id: string;
  readonly serviceId: string;
  readonly enabled: boolean;
  readonly config?: Record<string, unknown>;
  readonly slots: readonly WorkflowSlotConfiguration[];
}

export interface WorkflowConfigurationV2 {
  readonly version: "2.0.0";
  readonly source: { type: "construct3" | "folder"; path: string; profilePath?: string };
  readonly packagers: readonly WorkflowPackagerConfiguration[];
  readonly destinations: readonly WorkflowDestinationV2Configuration[];
}

const stepIdForOutput = (packagerId: string, outputId: ArtifactOutputId) =>
  `packager-${packagerId}-${outputId.replaceAll(".", "-")}`;

const sourceSteps = (source: WorkflowConfigurationV2["source"]): WorkflowStep[] => [
  {
    id: "source-export",
    uses: source.type === "construct3" ? "construct:export" : "construct:export-folder",
    with: source.type === "construct3"
      ? { file: "${{ variables.sourcePath }}", ...(source.profilePath ? { customProfile: source.profilePath } : {}) }
      : { folder: "${{ variables.sourcePath }}" },
  },
  { id: "prebundle", uses: "source:extract", needs: ["source-export"], with: { file: "${{ steps.source-export.outputs.zipFile }}" } },
];

const producerStep = (packager: WorkflowPackagerConfiguration, outputId: ArtifactOutputId): WorkflowStep => {
  const output = ARTIFACT_OUTPUTS[outputId];
  return {
    id: stepIdForOutput(packager.id, outputId),
    uses: output.packager === "electron" ? "electron:bundle" : output.packager === "tauri" ? "tauri:bundle" : "web:bundle",
    needs: ["prebundle"],
    with: {
      packagerId: packager.id,
      outputId,
      version: "${{ variables.version }}",
      "input-folder": "${{ steps.prebundle.outputs.outputDirectory }}",
      ...(packager.config || {}),
      platform: output.platform === "windows" ? "win32" : output.platform === "macos" ? "darwin" : output.platform,
      arch: output.architecture,
    },
  };
};

export const compileWorkflow = (configuration: WorkflowConfigurationV2): Workflow => {
  const steps = sourceSteps(configuration.source);
  const producers = new Map<string, string>();
  for (const packager of configuration.packagers.filter((item) => item.enabled)) {
    const configuredTargets = packager.config?.targets;
    const targets = Array.isArray(configuredTargets) ? configuredTargets as ArtifactOutputId[] : Object.values(ARTIFACT_OUTPUTS).filter((output) => output.packager === packager.definitionId).map((output) => output.id);
    for (const outputId of [...new Set(targets)]) {
      const output = ARTIFACT_OUTPUTS[outputId];
      if (!output || output.packager !== packager.definitionId) continue;
      const producer = producerStep(packager, outputId);
      steps.push(producer);
      producers.set(`${packager.id}:${outputId}`, producer.id);
    }
  }
  for (const destination of configuration.destinations.filter((item) => item.enabled)) {
    for (const slot of destination.slots.filter((item) => item.enabled !== false)) {
      const producer = producers.get(`${slot.input.packagerId}:${slot.input.outputId}`);
      if (!producer) continue;
      steps.push({
        id: `delivery-${destination.id}-${slot.id}`,
        uses: destination.serviceId === "web-folder" ? "filesystem:copy" : destination.serviceId === "zip" ? "filesystem:zip" : `${destination.serviceId}:upload`,
        needs: [producer],
        delivery: {
          destinationId: destination.id,
          slotId: slot.id,
          artifactOutputId: slot.input.outputId,
        },
        with: {
          ...(destination.config || {}), ...(slot.config || {}), packagerId: slot.input.packagerId, version: "${{ variables.version }}",
          ...(destination.serviceId === "steam" ? { folder: `\${{ steps.${producer}.outputs.bundleDirectory }}` } : {}),
          ...(destination.serviceId === "itch" ? { "input-folder": `\${{ steps.${producer}.outputs.bundleDirectory }}` } : {}),
          ...(destination.serviceId === "web-folder" ? { from: `\${{ steps.${producer}.outputs.output }}`, to: slot.config?.outputDir || destination.config?.outputDir, recursive: true } : {}),
          ...(destination.serviceId === "zip" ? { from: `\${{ steps.${producer}.outputs.output }}`, to: slot.config?.outputPath } : {}),
        },
      });
    }
  }
  return { version: 1, steps, continueOnError: true };
};
