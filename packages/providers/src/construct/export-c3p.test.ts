import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportc3p } from "./export-shared.js";
import {
  constructExportWorkflowTaskFactory,
  formatSavedConstructVersion,
  type ConstructWorkflowTaskServices,
} from "./export-c3p.js";

vi.mock("./export-shared.js", () => ({
  exportc3p: vi.fn(async () => ({ folder: "", parentFolder: "", zipFile: "/out/project.zip" })),
}));

vi.mock("./saved-version.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./saved-version.js")>()),
  getSavedConstructVersion: vi.fn(async () => undefined),
}));

describe("Construct project release version", () => {
  it("preserves patch releases encoded in savedWithRelease", () => {
    expect(formatSavedConstructVersion(39700)).toBe("r397");
    expect(formatSavedConstructVersion(43202)).toBe("r432-2");
    expect(formatSavedConstructVersion(3802)).toBe("r38-2");
    expect(formatSavedConstructVersion(9900)).toBe("r99");
  });

  it("returns undefined when the decoded release is not positive or metadata is invalid", () => {
    expect(formatSavedConstructVersion(0)).toBeUndefined();
    expect(formatSavedConstructVersion(99)).toBeUndefined();
    expect(formatSavedConstructVersion("43202")).toBeUndefined();
  });
});

describe("Construct export type task input", () => {
  let root: string;
  let projectFile: string;

  beforeEach(async () => {
    vi.mocked(exportc3p).mockClear();
    root = await mkdtemp(join(tmpdir(), "construct-export-type-"));
    projectFile = join(root, "project.c3p");
    await writeFile(projectFile, "{}");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const services = {
    context: { getThirdPartyPath: () => join(root, "thirdparty") },
    executables: { node: "node", pnpm: "pnpm" },
    run: { projectId: "project-1" },
  } as unknown as ConstructWorkflowTaskServices;

  type ExportTask = Parameters<ReturnType<typeof constructExportWorkflowTaskFactory>>[0];

  const runTask = (inputs: Record<string, unknown>) => {
    const task = {
      inputs: { file: projectFile, ...inputs },
      connectionValues: {},
      workspace: { root },
      signal: new AbortController().signal,
      log: vi.fn(),
      setArtifact: vi.fn(),
    } as unknown as ExportTask;
    return constructExportWorkflowTaskFactory(services)(task);
  };

  const exportedInputs = () => vi.mocked(exportc3p).mock.calls[0]?.[1].inputs;

  it("passes the Web (HTML5) export type when the task does not set one", async () => {
    await runTask({});

    expect(exportedInputs()?.exportType).toBe("web");
  });

  it("passes a desktop export type through to the export", async () => {
    await runTask({ exportType: "wkwebview" });

    expect(exportedInputs()?.exportType).toBe("wkwebview");
  });

  it("rejects an unknown export type before starting the Construct export", async () => {
    await expect(runTask({ exportType: "electron" })).rejects.toThrow(
      'Unsupported Construct export type "electron"',
    );
    expect(exportc3p).not.toHaveBeenCalled();
  });
});
