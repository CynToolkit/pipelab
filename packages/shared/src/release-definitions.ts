import type { WorkflowSource } from "./release-flow";
import {
  PACKAGER_DEFINITIONS as CANONICAL_PACKAGER_DEFINITIONS,
  SERVICE_DEFINITIONS as CANONICAL_SERVICE_DEFINITIONS,
  type ArtifactOutputDescriptor as CanonicalArtifactOutputDescriptor,
  type ReleaseHostPlatform as CanonicalReleaseHostPlatform,
  type WorkflowArtifactOutputId as CanonicalWorkflowArtifactOutputId,
  type WorkflowPackagerDefinitionId as CanonicalWorkflowPackagerDefinitionId,
  type WorkflowServiceId as CanonicalWorkflowServiceId,
} from "@pipelab/constants";

export type WorkflowPackagerDefinitionId = CanonicalWorkflowPackagerDefinitionId;
export type WorkflowServiceId = CanonicalWorkflowServiceId;
export type WorkflowArtifactOutputId = CanonicalWorkflowArtifactOutputId;
export type ReleaseHostPlatform = CanonicalReleaseHostPlatform;

export type ArtifactOutputDescriptor = CanonicalArtifactOutputDescriptor;

export interface PackagerEditorField {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "array";
  defaultValue: string | number | boolean | string[];
  placeholder?: string;
  description?: string;
}

export interface WorkflowPackager {
  id: string;
  definitionId: WorkflowPackagerDefinitionId;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface WorkflowDeliverySlot {
  id: string;
  enabled?: boolean;
  config: Record<string, unknown>;
  input: { packagerId: string; outputId: WorkflowArtifactOutputId };
}

export interface WorkflowDestinationV2 {
  id: string;
  serviceId: WorkflowServiceId;
  enabled: boolean;
  config: Record<string, unknown>;
  slots: WorkflowDeliverySlot[];
}

export interface WorkflowConfigV2 {
  version: "2.0.0";
  id: string;
  project: string;
  name: string;
  description?: string;
  source: WorkflowSource;
  packagers: WorkflowPackager[];
  destinations: WorkflowDestinationV2[];
  continueOnError?: boolean;
  osOverrides?: Record<string, unknown>;
}

export interface ReleaseHostCapabilities {
  host: { platform: ReleaseHostPlatform; architecture: string };
  packagers: Record<WorkflowPackagerDefinitionId, {
    targets: Array<{ outputId: WorkflowArtifactOutputId; available: boolean; reason?: string }>;
  }>;
}

export const PACKAGER_DEFINITIONS: Record<WorkflowPackagerDefinitionId, {
  id: WorkflowPackagerDefinitionId;
  label: string;
  description: string;
  outputs: ArtifactOutputDescriptor[];
  features: string[];
  fields: PackagerEditorField[];
}> = {
  electron: {
    ...CANONICAL_PACKAGER_DEFINITIONS.electron,
    features: ["Steam Overlay", "Steam Game ID", "WebSocket APIs"],
    fields: [
      { key: "name", label: "Application name", kind: "text", defaultValue: "Pipelab" },
      { key: "appBundleId", label: "Bundle ID", kind: "text", defaultValue: "com.pipelab.app" },
      { key: "appCopyright", label: "Copyright", kind: "text", defaultValue: "Copyright © 2024 Pipelab" },
      { key: "appVersion", label: "Application version", kind: "text", defaultValue: "1.0.0" },
      { key: "icon", label: "Application icon", kind: "text", defaultValue: "", placeholder: "Path to .icns/.ico/.png" },
      { key: "author", label: "Author", kind: "text", defaultValue: "Pipelab" },
      { key: "description", label: "Description", kind: "text", defaultValue: "A simple Electron application" },
      { key: "customPackages", label: "Custom npm packages", kind: "array", defaultValue: [], placeholder: "package or package@version" },
      { key: "appCategoryType", label: "macOS category", kind: "text", defaultValue: "public.app-category.developer-tools" },
      { key: "width", label: "Window width", kind: "number", defaultValue: 800 },
      { key: "height", label: "Window height", kind: "number", defaultValue: 600 },
      { key: "fullscreen", label: "Fullscreen", kind: "boolean", defaultValue: false },
      { key: "frame", label: "Window frame", kind: "boolean", defaultValue: true },
      { key: "transparent", label: "Transparent window", kind: "boolean", defaultValue: false },
      { key: "toolbar", label: "Toolbar", kind: "boolean", defaultValue: true },
      { key: "alwaysOnTop", label: "Always on top", kind: "boolean", defaultValue: false },
      { key: "backgroundColor", label: "Background color", kind: "text", defaultValue: "#ffffff" },
      { key: "electronVersion", label: "Electron version", kind: "text", defaultValue: "", placeholder: "Latest" },
      { key: "customMainCode", label: "Custom main code", kind: "text", defaultValue: "", placeholder: "Path to main.js" },
      { key: "disableAsarPackaging", label: "Disable ASAR packaging", kind: "boolean", defaultValue: true },
      { key: "enableExtraLogging", label: "Extra logging", kind: "boolean", defaultValue: false },
      { key: "clearServiceWorkerOnBoot", label: "Clear service worker on boot", kind: "boolean", defaultValue: false },
      { key: "openDevtoolsOnStart", label: "Open DevTools on start", kind: "boolean", defaultValue: false },
      { key: "enableInProcessGPU", label: "In-process GPU", kind: "boolean", defaultValue: false },
      { key: "enableDisableRendererBackgrounding", label: "Disable renderer backgrounding", kind: "boolean", defaultValue: false },
      { key: "forceHighPerformanceGpu", label: "High-performance GPU", kind: "boolean", defaultValue: false },
      { key: "websocketApi", label: "Allowed WebSocket APIs", kind: "array", defaultValue: [], placeholder: "API name" },
      { key: "ignore", label: "Folders to ignore", kind: "array", defaultValue: [], placeholder: "Folder or pattern" },
      { key: "enableSteamSupport", label: "Steam support", kind: "boolean", defaultValue: false },
      { key: "steamGameId", label: "Steam game ID", kind: "number", defaultValue: 480 },
      { key: "enableDiscordSupport", label: "Discord support", kind: "boolean", defaultValue: false },
      { key: "discordAppId", label: "Discord application ID", kind: "text", defaultValue: "" },
      { key: "enableDoctor", label: "Include doctor file", kind: "boolean", defaultValue: true },
      { key: "serverMode", label: "Server mode", kind: "text", defaultValue: "default" },
    ],
  },
  tauri: {
    ...CANONICAL_PACKAGER_DEFINITIONS.tauri,
    features: ["WebSocket APIs"],
    fields: [],
  },
  web: {
    ...CANONICAL_PACKAGER_DEFINITIONS.web,
    features: ["WebSocket APIs"],
    fields: [],
  },
};

export const SERVICE_DEFINITIONS = CANONICAL_SERVICE_DEFINITIONS;

const hostName = (platform: ReleaseHostPlatform) => platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "Linux";

export const getTargetAvailability = (
  definitionId: WorkflowPackagerDefinitionId,
  output: ArtifactOutputDescriptor,
  host: ReleaseHostCapabilities["host"],
): { available: boolean; reason?: string } => {
  if (output.platform === "macos" && host.platform !== "darwin") {
    return { available: false, reason: `${PACKAGER_DEFINITIONS[definitionId].label} macOS builds require a macOS host.` };
  }
  if (output.platform === "windows" && host.architecture !== "x64") {
    return { available: false, reason: `${PACKAGER_DEFINITIONS[definitionId].label} Windows builds require an x64 host.` };
  }
  return { available: true };
};

export const getReleaseHostCapabilities = (host: ReleaseHostCapabilities["host"]): ReleaseHostCapabilities => {
  const packagers = {} as ReleaseHostCapabilities["packagers"];
  for (const [id, definition] of Object.entries(PACKAGER_DEFINITIONS) as Array<[WorkflowPackagerDefinitionId, typeof PACKAGER_DEFINITIONS[WorkflowPackagerDefinitionId]]>) {
    packagers[id] = { targets: definition.outputs.map((output) => ({ outputId: output.id, ...getTargetAvailability(id, output, host) })) };
  }
  return { host, packagers };
};

export const outputsForPackager = (packager: WorkflowPackager): ArtifactOutputDescriptor[] => {
  const all = PACKAGER_DEFINITIONS[packager.definitionId].outputs;
  const selected = packager.config.targets;
  return Array.isArray(selected) ? all.filter((output) => selected.includes(output.id)) : all;
};

export const outputDescriptor = (outputId: WorkflowArtifactOutputId) =>
  Object.values(PACKAGER_DEFINITIONS).flatMap((definition) => definition.outputs).find((output) => output.id === outputId);

export const createDefaultPackager = (
  definitionId: WorkflowPackagerDefinitionId,
  id = `${definitionId}-${cryptoRandomId()}`,
  capabilities?: ReleaseHostCapabilities,
): WorkflowPackager => ({
  id,
  definitionId,
  name: PACKAGER_DEFINITIONS[definitionId].label,
  enabled: true,
  config: {
    targets: PACKAGER_DEFINITIONS[definitionId].outputs
      .filter((output) => !capabilities || capabilities.packagers[definitionId]?.targets.find((target) => target.outputId === output.id)?.available)
      .map((output) => output.id),
    ...Object.fromEntries(PACKAGER_DEFINITIONS[definitionId].fields.map((field) => [field.key, field.defaultValue])),
  },
});

export const createDefaultDestination = (
  serviceId: WorkflowServiceId,
  _packagers: WorkflowPackager[],
  _capabilities?: ReleaseHostCapabilities,
): WorkflowDestinationV2 => {
  return { id: `${serviceId}-${cryptoRandomId()}`, serviceId, enabled: true, config: {}, slots: [] };
};

export const validateWorkflowConfigV2 = (
  workflow: WorkflowConfigV2,
  capabilities: ReleaseHostCapabilities,
): string[] => {
  const errors: string[] = [];
  const packagers = new Map(workflow.packagers.map((packager) => [packager.id, packager]));
  for (const packager of workflow.packagers) {
    const definition = PACKAGER_DEFINITIONS[packager.definitionId];
    if (!definition) { errors.push(`Unknown packager definition ${packager.definitionId}.`); continue; }
    if (!packager.enabled) continue;
    const targets = Array.isArray(packager.config.targets) ? packager.config.targets : [];
    for (const outputId of targets) {
      const output = definition.outputs.find((candidate) => candidate.id === outputId);
      if (!output) { errors.push(`${packager.name} does not produce ${String(outputId)}.`); continue; }
      const availability = capabilities.packagers[packager.definitionId]?.targets.find((target) => target.outputId === output.id);
      if (availability && !availability.available) errors.push(availability.reason || `${output.label} is unavailable on this host.`);
    }
  }
  for (const destination of workflow.destinations.filter((item) => item.enabled)) {
    const service = SERVICE_DEFINITIONS[destination.serviceId];
    if (!service) { errors.push(`Unknown destination service ${destination.serviceId}.`); continue; }
    const activeSlots = destination.slots.filter((slot) => slot.enabled !== false);
    if (!destination.slots.length) { errors.push(`${service.label} has no ${service.slotLabel} slots.`); continue; }
    if (!activeSlots.length) { errors.push(`${service.label} has no enabled ${service.slotLabel} slots.`); continue; }
    if ((destination.config.migration as { unresolved?: boolean } | undefined)?.unresolved) errors.push(`${service.label} has unresolved migrated ${service.slotLabel} slots.`);
    if (destination.serviceId === "steam") {
      if (!String(destination.config.accountConnectionId || "").trim()) errors.push("Steam requires an account connection.");
      if (!String(destination.config.appId || "").trim()) errors.push("Steam requires an App ID.");
    }
    if (destination.serviceId === "itch") {
      if (!String(destination.config.accountConnectionId || "").trim()) errors.push("Itch.io requires an account connection.");
      if (!String(destination.config.project || "").trim()) errors.push("Itch.io requires a project.");
    }
    if (destination.serviceId === "web-folder" && !activeSlots.every((slot) => String(slot.config.outputDir || destination.config.outputDir || "").trim())) errors.push("Folder requires an output folder for every enabled folder slot.");
    if (destination.serviceId === "zip" && !activeSlots.every((slot) => String(slot.config.outputPath || "").trim())) errors.push("ZIP file requires an output path.");
    for (const slot of destination.slots) {
      if (slot.enabled === false) continue;
      const packager = packagers.get(slot.input.packagerId);
      const output = packager && outputDescriptor(slot.input.outputId);
      if (!packager) { errors.push(`${service.label} references a missing packager.`); continue; }
      if ((slot.config.migration as { unresolved?: boolean } | undefined)?.unresolved) errors.push(`${service.label} ${service.slotLabel} requires artifact mapping.`);
      if (!packager.enabled) { errors.push(`${service.label} references disabled packager ${packager.name}.`); continue; }
      if (!output || !service.compatiblePackagers.includes(packager.definitionId) || !service.compatiblePlatforms.includes(output.platform)) { errors.push(`${service.label} cannot consume ${slot.input.outputId}.`); continue; }
      const selected = !Array.isArray(packager.config.targets) || packager.config.targets.includes(output.id);
      const availability = capabilities.packagers[packager.definitionId]?.targets.find((target) => target.outputId === output.id);
      if (!selected) errors.push(`${service.label} references a disabled target ${output.label}.`);
      if (availability && !availability.available) errors.push(availability.reason || `${output.label} is unavailable on this host.`);
      if (destination.serviceId === "steam" && !String(slot.config.depotId || "").trim()) errors.push(`${service.label} ${service.slotLabel} requires a Depot ID.`);
      if (destination.serviceId === "itch" && !String(slot.config.channel || "").trim()) errors.push(`${service.label} ${service.slotLabel} requires a channel.`);
    }
  }
  return [...new Set(errors)];
};

const cryptoRandomId = () => Math.random().toString(36).slice(2, 10);

const legacyOutput = (id: string): WorkflowArtifactOutputId | undefined => {
  if (id === "electron.windows") return "electron.windows";
  if (id === "electron.linux") return "electron.linux";
  if (id === "web.html5") return "web.html5";
  return undefined;
};

export const migrateWorkflowConfig = (value: unknown): WorkflowConfigV2 => {
  const input = (value || {}) as Record<string, any>;
  if (input.version === "2.0.0" && Array.isArray(input.packagers)) return input as WorkflowConfigV2;
  const legacyOutputs = Array.isArray(input.outputs) ? input.outputs.map(legacyOutput).filter(Boolean) as WorkflowArtifactOutputId[] : [];
  const destinations = Array.isArray(input.destinations) ? input.destinations : [];
  const electronOutputs = legacyOutputs.filter((id) => id.startsWith("electron."));
  const packagers: WorkflowPackager[] = [];
  if (electronOutputs.length || destinations.some((destination) => ["steam", "itch"].includes(destination.type))) {
    packagers.push({ ...createDefaultPackager("electron", "electron-legacy"), config: { targets: electronOutputs.length ? electronOutputs : ["electron.windows", "electron.linux"] } });
  }
  if (legacyOutputs.includes("web.html5") || destinations.some((destination) => ["web", "itch"].includes(destination.type))) {
    packagers.push(createDefaultPackager("web", "web-legacy"));
  }
  const migratedDestinations: WorkflowDestinationV2[] = destinations.map((destination, index) => {
    const serviceId: WorkflowServiceId = destination.type === "web" ? "web-folder" : destination.type;
    const compatible = SERVICE_DEFINITIONS[serviceId];
    const slots = packagers.flatMap((packager) => outputsForPackager(packager)
      .filter((output) => compatible.compatiblePackagers.includes(packager.definitionId) && compatible.compatiblePlatforms.includes(output.platform))
      .map((output, slotIndex) => ({
        id: `${serviceId}-${index}-${slotIndex}`,
        config: destination.type === "steam" ? { depotId: destination.depotId || "" } : destination.type === "itch" ? { channel: destination.channel || "web" } : {},
        enabled: true,
        input: { packagerId: packager.id, outputId: output.id },
      })));
    const { type: _type, ...config } = destination;
    const unresolved = ["steam", "itch"].includes(destination.type) && slots.length > 1;
    return { id: `${serviceId}-${index}`, serviceId, enabled: destination.enabled !== false, config: unresolved ? { ...config, migration: { unresolved: true } } : config, slots: unresolved ? slots.map((slot) => ({ ...slot, config: { ...slot.config, migration: { unresolved: true } } })) : slots };
  });
  return {
    version: "2.0.0",
    id: String(input.id || ""), project: String(input.project || ""), name: String(input.name || "Untitled workflow"),
    description: input.description, source: input.source || { type: "folder", path: "" }, packagers, destinations: migratedDestinations,
    continueOnError: input.continueOnError !== false,
  };
};
