import { describe, expect, it } from "vitest";
import filesystem from "./index";

describe("filesystem release sources", () => {
  it("keeps generic folder semantics neutral", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("folder-source"));
    expect(source?.output).toEqual({ kind: "files", container: "directory" });
  });

  it("keeps generic ZIP semantics neutral until an explicit unzip producer", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("zip-source"));
    expect(source?.output).toEqual({ kind: "files", container: "archive", format: "zip" });
    expect(source?.compile({ path: "/tmp/input.zip" }, { host: { platform: "linux", architecture: "x64" } }).artifact.descriptor).toEqual({ kind: "files", container: "archive", format: "zip" });
    const unzip = filesystem.release?.producers?.find((candidate) => candidate.id.endsWith("/unzip"));
    expect(unzip?.accepts).toEqual({ container: "archive", format: "zip" });
  });

  it("keeps Web ZIP semantic meaning while changing only its container", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("web-zip-source"));
    expect(source?.output).toEqual({ kind: "application", platform: "web", container: "archive", format: "zip" });
    expect(source?.compile({ path: "/tmp/web.zip" }, { host: { platform: "linux", architecture: "x64" } }).artifact.descriptor).toEqual({ kind: "application", platform: "web", container: "archive", format: "zip" });
  });

  it("preserves the complete descriptor through passthrough", () => {
    const passthrough = filesystem.release?.producers?.find((candidate) => candidate.id.endsWith("/passthrough"));
    const descriptor = { kind: "application" as const, technology: "custom", platform: "web", container: "directory" as const, capabilities: ["copy"] };
    const compiled = passthrough?.compile({ reference: { stepId: "source", artifact: "output" }, descriptor }, { id: "pass", provider: passthrough.id, enabled: true, targets: [{ id: "output", enabled: true, config: {} }], config: {}, input: { source: true } }, { host: { platform: "linux", architecture: "x64" } });
    expect(compiled?.artifacts.output.descriptor).toEqual(descriptor);
  });
});
