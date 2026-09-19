/// <reference path="./declarations.d.ts" />
import { makeRunner } from "./make";
import { packageRunner } from "./package";
import { previewRunner } from "./preview";

import { createNodeDefinition } from "@pipelab/plugin-core";
import {
  createMakeProps,
  createPackageProps,
  createPackageV2Props,
  createPreviewProps,
  IDMake,
  IDPackage,
  IDPackageV2,
  IDPreview,
} from "./forge";
import { configureRunner, props } from "./configure";
import { packageV2Runner } from "./package-v2";
import type { ReleaseProducerDefinition } from "@pipelab/shared";

export const electronTargetInputs = (targetId: string): { platform: "win32" | "linux" | "darwin"; arch: "x64" | "arm64" } => {
  const [target, arch] = targetId.split("-");
  const platform = target === "windows" ? "win32" : target === "macos" ? "darwin" : "linux";
  if (!(["x64", "arm64"] as string[]).includes(arch)) throw new Error(`Unsupported Electron target: ${targetId}`);
  return { platform, arch: arch as "x64" | "arm64" };
};

const electronTargetDescriptor = (id: string) => {
  const inputs = electronTargetInputs(id);
  return { kind: "application" as const, technology: "electron", platform: inputs.platform === "win32" ? "windows" : inputs.platform === "darwin" ? "macos" : "linux", architecture: inputs.arch, container: "directory" as const };
};

const electronProducer: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-electron/producer",
  label: "Electron",
  accepts: { kind: "application", platform: "web", container: "directory" },
  targets: ["windows-x64", "linux-x64", "macos-arm64"].map((id) => ({ id, label: id, output: electronTargetDescriptor(id), createDefaultConfig: () => ({}), isAvailable: () => ({ available: true }) })),
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (input, config) => ({
    steps: config.targets.filter((target) => target.enabled).map((target) => ({ id: `${config.id}-${target.id}`, uses: "@pipelab/plugin-electron/electron:package:v2", needs: [input.reference.stepId], artifactInputs: { "input-folder": input.reference }, with: { ...config.config, ...target.config, ...electronTargetInputs(target.id) }, artifacts: { "electron-build": { descriptor: electronProducer.targets.find((candidate) => candidate.id === target.id)!.output } } })),
    artifacts: Object.fromEntries(config.targets.filter((target) => target.enabled).map((target) => [target.id, { reference: { stepId: `${config.id}-${target.id}`, artifact: "electron-build" }, descriptor: electronProducer.targets.find((candidate) => candidate.id === target.id)!.output }])),
  }),
};

export default createNodeDefinition({
  id: "@pipelab/plugin-electron",
  packageName: "@pipelab/plugin-electron",
  name: "Electron",
  description: "Pipelab plugin for packaging apps with Electron",
  icon: { type: "icon", icon: "pi-desktop" },
  isOfficial: true,
  nodes: [
    // make and package
    {
      node: createMakeProps(
        IDMake,
        "Create Installer",
        "Create a distributable installer for your chosen platform",
        "",
        "`Build package for ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
      ),
      runner: makeRunner,
      // disabled: platform === 'linux' ? 'Electron is not supported on Linux' : undefined
    },
    // package
    // v1
    {
      node: createPackageProps(
        IDPackage,
        "Package app",
        "Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.",
        "",
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
        true,
      ),
      runner: packageRunner,
    },
    // v2
    {
      node: createPackageV2Props(
        IDPackageV2,
        "Package app with configuration",
        "Gather all necessary files and prepare your app for distribution, creating a platform-specific bundle.",
        "",
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
        false,
        false,
        undefined,
        false,
        false,
      ),
      runner: packageV2Runner,
    },
    {
      node: createPreviewProps(
        IDPreview,
        "Preview app",
        "Package and preview your app from an URL",
        "",
        "`Preview app from ${fmt.param(params['input-url'], 'primary', 'URL not set')}`",
      ),
      runner: previewRunner,
    },
    {
      node: props,
      runner: configureRunner,
    },
    // {
    //   node: propsConfigureV2,
    //   runner: configureV2Runner
    // }
    // make without package
    // {
    //   node: packageApp,
    //   runner: packageRunner,
    // },
  ],
  release: { producers: [electronProducer] },
});
