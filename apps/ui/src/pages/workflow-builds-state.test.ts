import { describe, expect, it, vi } from "vitest";
import type { ReleaseBuildProfileConfig } from "@pipelab/shared";
import {
  buildIssueControlId,
  buildInspectionSignature,
  hasUnsavedReleaseWorkflowState,
  persistBuildChangesBeforeNavigation,
  preventBeforeUnloadIfUnsaved,
  producerInspectionResponseIsCurrent,
  resolveUnappliedBuildNavigation,
  resolveBuildIssueRequest,
} from "./workflow-builds-state";

const build: ReleaseBuildProfileConfig = {
  id: "desktop-build",
  type: "desktop",
  engine: "engine/electron",
  enabled: true,
  config: {},
  targets: [{ id: "windows-x64", enabled: true, config: {} }],
};

describe("workflow builds page state", () => {
  it("treats an unchanged staged build as clean using structural equality", () => {
    const draft = {
      ...build,
      targets: [{ ...build.targets[0], config: { signing: false } }],
      config: { project: { path: "/game" }, mode: "release" },
    };
    const current = {
      ...draft,
      config: { mode: "release", project: { path: "/game" } },
      targets: [{ ...draft.targets[0], config: { signing: false } }],
    };

    expect(
      hasUnsavedReleaseWorkflowState({
        changeRevision: 3,
        persistedRevision: 3,
        saveState: "saved",
        buildSettingsOpen: true,
        draftBuild: draft,
        currentBuild: current,
      }),
    ).toBe(false);
  });

  it("treats changed staged build settings as unsaved", () => {
    expect(
      hasUnsavedReleaseWorkflowState({
        changeRevision: 3,
        persistedRevision: 3,
        saveState: "saved",
        buildSettingsOpen: true,
        draftBuild: { ...build, config: { projectPath: "/changed" } },
        currentBuild: build,
      }),
    ).toBe(true);
  });

  it.each([
    { changeRevision: 2, persistedRevision: 1, saveState: "saved" as const },
    { changeRevision: 1, persistedRevision: 1, saveState: "saving" as const },
    { changeRevision: 1, persistedRevision: 1, saveState: "error" as const },
  ])("treats $saveState workflow state as unsaved", (state) => {
    expect(hasUnsavedReleaseWorkflowState(state)).toBe(true);
  });

  it("prevents beforeunload only while unsaved state exists", () => {
    const dirtyEvent = { preventDefault: vi.fn(), returnValue: "" };
    const cleanEvent = { preventDefault: vi.fn(), returnValue: "" };

    expect(preventBeforeUnloadIfUnsaved(dirtyEvent, true)).toBe(true);
    expect(dirtyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(dirtyEvent.returnValue).toBe("");
    expect(preventBeforeUnloadIfUnsaved(cleanEvent, false)).toBe(false);
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps staged edits on Keep editing and discards them only on confirmation", async () => {
    const discard = vi.fn();
    await expect(resolveUnappliedBuildNavigation(true, async () => false, discard)).resolves.toBe(
      false,
    );
    expect(discard).not.toHaveBeenCalled();

    await expect(resolveUnappliedBuildNavigation(true, async () => true, discard)).resolves.toBe(
      true,
    );
    expect(discard).toHaveBeenCalledOnce();
  });

  it("waits for the edited build to save before allowing navigation", async () => {
    let dirty = true;
    let finishSave!: () => void;
    const savePending = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const cancelTimer = vi.fn();
    const save = vi.fn(async () => {
      await savePending;
      dirty = false;
    });
    let navigated = false;

    const canNavigate = persistBuildChangesBeforeNavigation(() => dirty, cancelTimer, save).then(
      (allowed) => {
        navigated = allowed;
        return allowed;
      },
    );

    await Promise.resolve();
    expect(cancelTimer).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(navigated).toBe(false);
    finishSave();

    await expect(canNavigate).resolves.toBe(true);
    expect(navigated).toBe(true);
  });

  it("prevents leaving Builds when the pending save fails", async () => {
    const canNavigate = await persistBuildChangesBeforeNavigation(
      () => true,
      vi.fn(),
      async () => {
        throw new Error("Save failed");
      },
    );

    expect(canNavigate).toBe(false);
  });

  it("maps build issue paths to the matching settings control", () => {
    expect(buildIssueControlId(build, 0, "builds.0.config.projectPath")).toBe(
      "build-desktop-build-projectPath",
    );
    expect(buildIssueControlId(build, 0, "builds.0.targets.0.config.signature")).toBe(
      "target-desktop-build-windows-x64-signature",
    );
    expect(buildIssueControlId(build, 0, "builds.0.targets.0")).toBe(
      "build-target-desktop-build-windows-x64",
    );
    expect(buildIssueControlId(build, 0, "builds.1.config.projectPath")).toBeUndefined();
  });

  it("opens the build addressed by Configuration issue navigation", () => {
    const anotherBuild = { ...build, id: "web-build" };
    expect(resolveBuildIssueRequest([build, anotherBuild], "web-build", "builds.0.input")).toBe(
      anotherBuild,
    );
    expect(resolveBuildIssueRequest([build, anotherBuild], "", "builds.1.input")).toBe(
      anotherBuild,
    );
    expect(resolveBuildIssueRequest([build], "removed-build", "builds.0.input")).toBeUndefined();
  });

  it("changes producer inspection revision when provider or target fields change", () => {
    const original = buildInspectionSignature(build);
    expect(buildInspectionSignature({ ...build, engine: "engine/other" })).not.toBe(original);
    expect(buildInspectionSignature({ ...build, config: { projectPath: "/game" } })).not.toBe(
      original,
    );
    expect(
      buildInspectionSignature({
        ...build,
        targets: [{ ...build.targets[0], config: { signing: true } }],
      }),
    ).not.toBe(original);
    expect(buildInspectionSignature(undefined)).toBe("");
  });

  it("rejects producer inspection results from older requests or closed dialogs", () => {
    expect(producerInspectionResponseIsCurrent(4, 5, true, build.id, build.id)).toBe(false);
    expect(producerInspectionResponseIsCurrent(5, 5, false, build.id, build.id)).toBe(false);
    expect(producerInspectionResponseIsCurrent(5, 5, true, build.id, "another-build")).toBe(false);
    expect(producerInspectionResponseIsCurrent(5, 5, true, build.id, build.id)).toBe(true);
  });
});
