export type WorkflowPackagerDefinitionId = "electron" | "tauri" | "web";
export type WorkflowServiceId = "steam" | "itch" | "web-folder" | "zip" | "poki" | "pipelab-cloud";
export type WorkflowArtifactOutputId =
  | "electron.windows"
  | "electron.linux"
  | "electron.macos.arm64"
  | "tauri.windows"
  | "tauri.linux"
  | "tauri.macos.arm64"
  | "web.html5";
export type ReleaseHostPlatform = "win32" | "linux" | "darwin";

export interface ArtifactOutputDescriptor {
  id: WorkflowArtifactOutputId;
  platform: "windows" | "linux" | "macos" | "web";
  architecture: string;
  format: string;
  label: string;
  capabilities: string[];
}

export interface PackagerDefinition {
  id: WorkflowPackagerDefinitionId;
  label: string;
  description: string;
  outputs: ArtifactOutputDescriptor[];
}

export interface DestinationDefinition {
  id: WorkflowServiceId;
  label: string;
  icon: string;
  slotLabel: string;
  outputs: WorkflowArtifactOutputId[];
  compatiblePackagers: WorkflowPackagerDefinitionId[];
  compatiblePlatforms: Array<ArtifactOutputDescriptor["platform"]>;
}

export const PACKAGER_DEFINITIONS: Record<WorkflowPackagerDefinitionId, PackagerDefinition> = {
  electron: {
    id: "electron",
    label: "Electron",
    description: "Package the game as a desktop application.",
    outputs: [
      { id: "electron.windows", label: "Windows x64", platform: "windows", architecture: "x64", format: "zip", capabilities: ["Steam Overlay"] },
      { id: "electron.linux", label: "Linux x64", platform: "linux", architecture: "x64", format: "zip", capabilities: ["Steam Overlay"] },
      { id: "electron.macos.arm64", label: "macOS arm64", platform: "macos", architecture: "arm64", format: "zip", capabilities: ["Steam Overlay"] },
    ],
  },
  tauri: {
    id: "tauri",
    label: "Tauri",
    description: "Package a lightweight desktop application.",
    outputs: [
      { id: "tauri.windows", label: "Windows x64", platform: "windows", architecture: "x64", format: "zip", capabilities: [] },
      { id: "tauri.linux", label: "Linux x64", platform: "linux", architecture: "x64", format: "zip", capabilities: [] },
      { id: "tauri.macos.arm64", label: "macOS arm64", platform: "macos", architecture: "arm64", format: "zip", capabilities: [] },
    ],
  },
  web: {
    id: "web",
    label: "Web",
    description: "Prepare an HTML5 artifact.",
    outputs: [
      { id: "web.html5", label: "HTML5", platform: "web", architecture: "none", format: "folder", capabilities: [] },
    ],
  },
};

export const SERVICE_DEFINITIONS: Record<WorkflowServiceId, DestinationDefinition> = {
  steam: { id: "steam", label: "Steam", icon: "mdi-steam", slotLabel: "slot", outputs: ["electron.windows", "electron.linux", "electron.macos.arm64", "tauri.windows", "tauri.linux", "tauri.macos.arm64"], compatiblePackagers: ["electron", "tauri"], compatiblePlatforms: ["windows", "linux", "macos"] },
  itch: { id: "itch", label: "Itch.io", icon: "mdi-puzzle-outline", slotLabel: "slot", outputs: ["electron.windows", "electron.linux", "electron.macos.arm64", "tauri.windows", "tauri.linux", "tauri.macos.arm64", "web.html5"], compatiblePackagers: ["electron", "tauri", "web"], compatiblePlatforms: ["windows", "linux", "macos", "web"] },
  "web-folder": { id: "web-folder", label: "Folder", icon: "mdi-folder-upload-outline", slotLabel: "slot", outputs: ["web.html5"], compatiblePackagers: ["web"], compatiblePlatforms: ["web"] },
  zip: { id: "zip", label: "ZIP", icon: "mdi-folder-zip-outline", slotLabel: "slot", outputs: ["electron.windows", "electron.linux", "electron.macos.arm64", "tauri.windows", "tauri.linux", "tauri.macos.arm64", "web.html5"], compatiblePackagers: ["electron", "tauri", "web"], compatiblePlatforms: ["windows", "linux", "macos", "web"] },
  poki: { id: "poki", label: "Poki", icon: "mdi-gamepad-variant-outline", slotLabel: "slot", outputs: ["web.html5"], compatiblePackagers: ["web"], compatiblePlatforms: ["web"] },
  "pipelab-cloud": { id: "pipelab-cloud", label: "Pipelab Cloud", icon: "mdi-cloud-upload-outline", slotLabel: "artifact", outputs: ["electron.windows", "electron.linux", "electron.macos.arm64", "tauri.windows", "tauri.linux", "tauri.macos.arm64", "web.html5"], compatiblePackagers: ["electron", "tauri", "web"], compatiblePlatforms: ["windows", "linux", "macos", "web"] },
};

export interface ArtifactOutputDefinition extends ArtifactOutputDescriptor {
  packager: WorkflowPackagerDefinitionId;
}

export const ARTIFACT_OUTPUTS = Object.fromEntries(
  Object.values(PACKAGER_DEFINITIONS).flatMap((packager) =>
    packager.outputs.map((output) => [output.id, { ...output, packager: packager.id }]),
  ),
) as Record<WorkflowArtifactOutputId, ArtifactOutputDefinition>;

export const PACKAGERS: readonly PackagerDefinition[] = Object.values(PACKAGER_DEFINITIONS);
export const DESTINATIONS: readonly Pick<DestinationDefinition, "id" | "label" | "outputs">[] = Object.values(SERVICE_DEFINITIONS);
