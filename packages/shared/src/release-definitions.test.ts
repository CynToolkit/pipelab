import { describe, expect, it } from "vitest";
import {
  createDefaultDestination,
  createDefaultPackager,
  getReleaseHostCapabilities,
  migrateWorkflowConfig,
  outputsForPackager,
  PACKAGER_DEFINITIONS,
  SERVICE_DEFINITIONS,
  validateWorkflowConfigV2,
} from "./release-definitions";

describe("release definitions", () => {
  it("keeps macOS targets visible but unavailable off macOS", () => {
    const capabilities = getReleaseHostCapabilities({ platform: "linux", architecture: "x64" });
    const target = capabilities.packagers.electron.targets.find((item) => item.outputId === "electron.macos.arm64");
    expect(target).toMatchObject({ available: false });
    expect(target?.reason).toContain("macOS host");
  });

  it("creates new destinations without default delivery slots", () => {
    const electron = createDefaultPackager("electron", "electron-linux");
    electron.config.targets = ["electron.linux"];
    const steam = createDefaultDestination("steam", [electron], getReleaseHostCapabilities({ platform: "linux", architecture: "x64" }));
    expect(steam.slots).toHaveLength(0);
  });

  it("allows Pipelab Cloud to host every stable artifact output", () => {
    expect(SERVICE_DEFINITIONS["pipelab-cloud"].outputs).toEqual([
      "electron.windows",
      "electron.linux",
      "electron.macos.arm64",
      "tauri.windows",
      "tauri.linux",
      "tauri.macos.arm64",
      "web.html5",
      "godot.windows",
      "godot.linux",
      "godot.macos.arm64",
      "godot.web",
    ]);
  });

  it("routes Godot outputs to their supported destinations", () => {
    expect(SERVICE_DEFINITIONS.steam.outputs).toEqual(expect.arrayContaining(["godot.windows", "godot.linux", "godot.macos.arm64"]));
    expect(SERVICE_DEFINITIONS.itch.outputs).toContain("godot.web");
    expect(SERVICE_DEFINITIONS.poki.outputs).toContain("godot.web");
    expect(SERVICE_DEFINITIONS["web-folder"].outputs).toContain("godot.web");
    expect(SERVICE_DEFINITIONS.zip.outputs).toEqual(expect.arrayContaining(["godot.windows", "godot.linux", "godot.macos.arm64", "godot.web"]));
  });

  it("migrates the legacy flat output list to packagers and exact slot inputs", () => {
    const migrated = migrateWorkflowConfig({
      version: "1.0.0", id: "flow", project: "main", name: "Release", source: { type: "folder", path: "dist" },
      outputs: ["electron.windows", "web.html5"], destinations: [{ type: "itch", project: "game", channel: "windows" }],
    });
    expect(migrated.version).toBe("2.0.0");
    expect(migrated.packagers.map((item) => item.definitionId)).toEqual(["electron", "web"]);
    expect(migrated.destinations[0].slots[0].input.packagerId).toBe("electron-legacy");
    expect(outputsForPackager(migrated.packagers[0])).toHaveLength(1);
    expect(PACKAGER_DEFINITIONS.tauri.outputs.length).toBeGreaterThan(1);
  });

  it("rejects an unavailable exact slot before execution", () => {
    const electron = createDefaultPackager("electron", "electron-macos");
    const workflow = {
      version: "2.0.0" as const,
      id: "flow", project: "main", name: "Release", source: { type: "folder" as const, path: "dist" },
      packagers: [electron],
      destinations: [{ id: "steam", serviceId: "steam" as const, enabled: true, config: {}, slots: [{ id: "mac", config: {}, input: { packagerId: electron.id, outputId: "electron.macos.arm64" as const } }] }],
    };
    const errors = validateWorkflowConfigV2(workflow, getReleaseHostCapabilities({ platform: "linux", architecture: "x64" }));
    expect(errors.some((error) => error.includes("macOS host"))).toBe(true);
  });

  it("does not mark Steam ready without parent and depot settings", () => {
    const electron = createDefaultPackager("electron", "electron-linux");
    electron.config.targets = ["electron.linux"];
    const workflow = {
      version: "2.0.0" as const,
      id: "flow", project: "main", name: "Release", source: { type: "folder" as const, path: "dist" },
      packagers: [electron],
      destinations: [{ id: "steam", serviceId: "steam" as const, enabled: true, config: {}, slots: [{ id: "linux", config: {}, input: { packagerId: electron.id, outputId: "electron.linux" as const } }] }],
    };
    const errors = validateWorkflowConfigV2(workflow, getReleaseHostCapabilities({ platform: "linux", architecture: "x64" }));
    expect(errors).toEqual(expect.arrayContaining([
      "Steam requires an account connection.",
      "Steam requires an App ID.",
      "Steam slot requires a Depot ID.",
    ]));
  });

  it("supports ZIP delivery slots with an explicit output path", () => {
    const web = createDefaultPackager("web", "web-packager");
    const zip = createDefaultDestination("zip", [web], getReleaseHostCapabilities({ platform: "linux", architecture: "x64" }));
    expect(zip.slots).toHaveLength(0);
    const errors = validateWorkflowConfigV2({
      version: "2.0.0", id: "flow", project: "main", name: "Release", source: { type: "folder", path: "dist" },
      packagers: [web], destinations: [{ ...zip, slots: [{ id: "html", enabled: true, config: { outputPath: "" }, input: { packagerId: "web-packager", outputId: "web.html5" } }] }],
    }, getReleaseHostCapabilities({ platform: "linux", architecture: "x64" }));
    expect(errors).toContain("ZIP file requires an output path.");
  });
});
