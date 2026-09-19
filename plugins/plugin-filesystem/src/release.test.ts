import { describe, expect, it } from "vitest";
import filesystem from "./index";

describe("filesystem release sources", () => {
  it("keeps generic folder semantics neutral", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("folder-source"));
    expect(source?.output).toEqual({ kind: "files", container: "directory" });
  });

  it("keeps generic ZIP semantics neutral and extracts to the same semantic kind", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("zip-source"));
    expect(source?.output).toEqual({ kind: "files", container: "archive", format: "zip" });
    expect(source?.compile({ path: "/tmp/input.zip" }, { host: { platform: "linux", architecture: "x64" } }).artifact.descriptor).toEqual({ kind: "files", container: "directory", format: undefined });
  });

  it("keeps Web ZIP semantic meaning while changing only its container", () => {
    const source = filesystem.release?.sources?.find((candidate) => candidate.id.endsWith("web-zip-source"));
    expect(source?.output).toEqual({ kind: "application", platform: "web", container: "archive", format: "zip" });
    expect(source?.compile({ path: "/tmp/web.zip" }, { host: { platform: "linux", architecture: "x64" } }).artifact.descriptor).toEqual({ kind: "application", platform: "web", container: "directory", format: undefined });
  });
});
