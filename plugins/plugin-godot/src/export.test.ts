import { describe, expect, it } from "vitest";
import { godotTemplateDirectories } from "./export";

describe("Godot export support", () => {
  it("uses the platform-specific template directory", () => {
    expect(godotTemplateDirectories("win32", "C:/Users/test")[0]).toContain("AppData");
    expect(godotTemplateDirectories("darwin", "/Users/test")[0]).toContain("Library/Application Support/Godot");
    expect(godotTemplateDirectories("linux", "/home/test")[0]).toBe("/home/test/.local/share/godot/export_templates");
  });
});
