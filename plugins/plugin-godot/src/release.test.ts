import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { godotExporter } from "./index";

const context = (path: string) => ({ host: { platform: "linux", architecture: "x64" }, sourceConfig: { path } });

describe("Godot release preset validation", () => {
  const withProject = (callback: (path: string) => void) => {
    const path = mkdtempSync(join(tmpdir(), "pipelab-godot-"));
    writeFileSync(join(path, "export_presets.cfg"), `[preset.0]\nname="Web"\nplatform="Web"\n\n[preset.1]\nname="Windows"\nplatform="Windows Desktop"\n`);
    try { callback(path); } finally { rmSync(path, { recursive: true, force: true }); }
  };

  it("accepts an existing compatible preset", () => withProject((path) => {
    expect(godotExporter.validate({ id: "godot", provider: godotExporter.id, enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: { preset: "Web" } }] }, context(path))).toEqual([]);
  }));

  it("rejects an existing incompatible preset", () => withProject((path) => {
    expect(godotExporter.validate({ id: "godot", provider: godotExporter.id, enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: { preset: "Windows" } }] }, context(path)).map((issue) => issue.code)).toContain("godot.preset.target-mismatch");
  }));

  it("rejects unknown and missing presets", () => withProject((path) => {
    const unknown = godotExporter.validate({ id: "godot", provider: godotExporter.id, enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: { preset: "Missing" } }] }, context(path));
    expect(unknown.map((issue) => issue.code)).toContain("godot.preset.unknown");
    const missing = godotExporter.validate({ id: "godot", provider: godotExporter.id, enabled: true, config: {}, targets: [{ id: "web", enabled: true, config: {} }] }, context(path));
    expect(missing.map((issue) => issue.code)).toContain("godot.preset.required");
  }));
});
