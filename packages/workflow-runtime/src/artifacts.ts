export type ArtifactOutputId =
  | "electron.windows"
  | "electron.linux"
  | "electron.macos.arm64"
  | "tauri.windows"
  | "tauri.linux"
  | "tauri.macos.arm64"
  | "web.html5";

export interface ArtifactOutputDefinition {
  readonly id: ArtifactOutputId;
  readonly packager: "electron" | "tauri" | "web";
  readonly label: string;
  readonly platform: "windows" | "linux" | "macos" | "web";
  readonly architecture: "x64" | "arm64" | "none";
  readonly format: "zip" | "html5" | "folder";
}

export const ARTIFACT_OUTPUTS: Readonly<Record<ArtifactOutputId, ArtifactOutputDefinition>> = {
  "electron.windows": {
    id: "electron.windows",
    packager: "electron",
    label: "Windows x64",
    platform: "windows",
    architecture: "x64",
    format: "zip",
  },
  "electron.linux": {
    id: "electron.linux",
    packager: "electron",
    label: "Linux x64",
    platform: "linux",
    architecture: "x64",
    format: "zip",
  },
  "electron.macos.arm64": {
    id: "electron.macos.arm64",
    packager: "electron",
    label: "macOS arm64",
    platform: "macos",
    architecture: "arm64",
    format: "zip",
  },
  "tauri.windows": {
    id: "tauri.windows",
    packager: "tauri",
    label: "Windows x64",
    platform: "windows",
    architecture: "x64",
    format: "zip",
  },
  "tauri.linux": {
    id: "tauri.linux",
    packager: "tauri",
    label: "Linux x64",
    platform: "linux",
    architecture: "x64",
    format: "zip",
  },
  "tauri.macos.arm64": {
    id: "tauri.macos.arm64",
    packager: "tauri",
    label: "macOS arm64",
    platform: "macos",
    architecture: "arm64",
    format: "zip",
  },
  "web.html5": {
    id: "web.html5",
    packager: "web",
    label: "Web",
    platform: "web",
    architecture: "none",
    format: "html5",
  },
};

export interface PackagerDefinition {
  readonly id: "electron" | "tauri" | "web";
  readonly label: string;
  readonly outputs: readonly ArtifactOutputId[];
}

export const PACKAGERS: readonly PackagerDefinition[] = [
  { id: "electron", label: "Electron", outputs: ["electron.windows", "electron.linux"] },
  { id: "tauri", label: "Tauri", outputs: ["tauri.windows", "tauri.linux", "tauri.macos.arm64"] },
  { id: "web", label: "Web", outputs: ["web.html5"] },
];

export interface DestinationDefinition {
  readonly id: "steam" | "itch" | "web-folder" | "zip" | "poki";
  readonly label: string;
  readonly outputs: readonly ArtifactOutputId[];
}

export const DESTINATIONS: readonly DestinationDefinition[] = [
  { id: "steam", label: "Steam", outputs: ["electron.windows", "electron.linux"] },
  { id: "itch", label: "Itch", outputs: ["electron.windows", "electron.linux", "web.html5"] },
  { id: "zip", label: "ZIP", outputs: ["electron.windows", "electron.linux", "electron.macos.arm64", "tauri.windows", "tauri.linux", "tauri.macos.arm64", "web.html5"] },
  { id: "poki", label: "Poki", outputs: ["web.html5"] },
];

export interface ArtifactInstance {
  readonly id: string;
  readonly outputId: ArtifactOutputId;
  readonly version: string;
  readonly platform: ArtifactOutputDefinition["platform"];
  readonly architecture: ArtifactOutputDefinition["architecture"];
  readonly format: ArtifactOutputDefinition["format"];
  readonly path: string;
  readonly producerStep: string;
  readonly checksum?: string;
  readonly size?: number;
}
