/// <reference path="./declarations.d.ts" />
import { createDefinition } from "@pipelab/plugin-core";
import { packageV2Runner } from "./package";
import type { ReleaseProducerDefinition } from "@pipelab/shared";

export const workflowTaskRunners = {
  "@pipelab/plugin-tauri/tauri:package:v2": packageV2Runner,
};

export const tauriTargetInputs = (
  targetId: string,
): { platform: "win32" | "linux" | "darwin"; arch: "x64" | "arm64" } => {
  const [target, arch] = targetId.split("-");
  const platform = target === "windows" ? "win32" : target === "macos" ? "darwin" : "linux";
  if (!(["x64", "arm64"] as string[]).includes(arch))
    throw new Error(`Unsupported Tauri target: ${targetId}`);
  return { platform, arch: arch as "x64" | "arm64" };
};

const tauriTargetDescriptor = (id: string) => {
  const inputs = tauriTargetInputs(id);
  return {
    kind: "application" as const,
    technology: "tauri",
    platform:
      inputs.platform === "win32" ? "windows" : inputs.platform === "darwin" ? "macos" : "linux",
    architecture: inputs.arch,
    container: "directory" as const,
  };
};

const tauriProducer: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-tauri/producer",
  label: "Tauri",
  planning: { mode: "build" },
  accepts: { kind: "application", platform: "web", container: "directory" },
  targets: ["windows-x64", "linux-x64", "macos-arm64"].map((id) => ({
    id,
    label: id,
    buildType: "desktop",
    output: tauriTargetDescriptor(id),
    createDefaultConfig: () => ({}),
    isAvailable: () => ({ available: true }),
  })),
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => ({
    steps: config.targets
      .filter((target) => target.enabled)
      .map((target) => ({
        id: `${config.id}-${target.id}`,
        uses: "@pipelab/plugin-tauri/tauri:package:v2",
        needs: [input.reference.stepId],
        artifactInputs: { "input-folder": input.reference },
        with: { ...config.config, ...target.config, ...tauriTargetInputs(target.id) },
        artifacts: {
          output: {
            descriptor: tauriProducer.targets.find((candidate) => candidate.id === target.id)!
              .output!,
          },
        },
      })),
    artifacts: Object.fromEntries(
      config.targets
        .filter((target) => target.enabled)
        .map((target) => [
          target.id,
          {
            reference: { stepId: `${config.id}-${target.id}`, artifact: "output" },
            descriptor: tauriProducer.targets.find((candidate) => candidate.id === target.id)!
              .output!,
          },
        ]),
    ),
  }),
};

export default createDefinition({
  id: "@pipelab/plugin-tauri",
  packageName: "@pipelab/plugin-tauri",
  name: "Tauri",
  description: "Pipelab plugin for packaging apps with Tauri",
  icon: { type: "icon", icon: "pi-box" },
  isOfficial: true,
  release: { producers: [tauriProducer] },
});
