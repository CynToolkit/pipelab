/// <reference path="./declarations.d.ts" />
import { createProviderDefinition } from "@pipelab/shared";
import type { ReleaseProducerDefinition } from "@pipelab/shared";
import { electronWorkflowTaskFactories } from "./package-v2";

export const electronTargetInputs = (
  targetId: string,
): { platform: "win32" | "linux" | "darwin"; arch: "x64" | "arm64" } => {
  const [target, arch] = targetId.split("-");
  const platform = target === "windows" ? "win32" : target === "macos" ? "darwin" : "linux";
  if (!(["x64", "arm64"] as string[]).includes(arch))
    throw new Error(`Unsupported Electron target: ${targetId}`);
  return { platform, arch: arch as "x64" | "arm64" };
};

const electronTargetDescriptor = (id: string) => {
  const inputs = electronTargetInputs(id);
  return {
    kind: "application" as const,
    technology: "electron",
    platform:
      inputs.platform === "win32" ? "windows" : inputs.platform === "darwin" ? "macos" : "linux",
    architecture: inputs.arch,
    container: "directory" as const,
  };
};

const electronProducer: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-electron/producer",
  label: "Electron",
  planning: { mode: "build" },
  accepts: { kind: "application", platform: "web", container: "directory" },
  targets: ["windows-x64", "linux-x64", "macos-arm64"].map((id) => ({
    id,
    label: id,
    buildType: "desktop",
    output: electronTargetDescriptor(id),
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
        uses: "@pipelab/plugin-electron/electron:package:v2",
        needs: [input.reference.stepId],
        artifactInputs: { "input-folder": input.reference },
        with: { ...config.config, ...target.config, ...electronTargetInputs(target.id) },
        artifacts: {
          "electron-build": {
            descriptor: electronProducer.targets.find((candidate) => candidate.id === target.id)!
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
            reference: { stepId: `${config.id}-${target.id}`, artifact: "electron-build" },
            descriptor: electronProducer.targets.find((candidate) => candidate.id === target.id)!
              .output!,
          },
        ]),
    ),
  }),
};

export const provider = createProviderDefinition({
  id: "@pipelab/plugin-electron",
  packageName: "@pipelab/plugin-electron",
  name: "Electron",
  description: "Pipelab plugin for packaging apps with Electron",
  icon: { type: "icon", icon: "pi-desktop" },
  isOfficial: true,
  release: { producers: [electronProducer] },
  workflowTasks: electronWorkflowTaskFactories,
});

export default provider;
