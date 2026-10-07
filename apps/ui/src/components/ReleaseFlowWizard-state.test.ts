import { describe, expect, it } from "vitest";
import { computed, reactive } from "vue";
import { resolveReleaseDefaults } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseRegistry } from "@pipelab/shared";
import {
  buildReleaseWizardConfig,
  createReleaseWizardDraft,
  RELEASE_WIZARD_STEPS,
  releaseWizardCanReview,
  releaseWizardDestination,
  releaseWizardHasSource,
  releaseWizardNextStep,
  releaseWizardPreviousStep,
  releaseWizardRecap,
} from "./ReleaseFlowWizard-state";

const catalog: ReleaseCatalog = {
  buildTypes: [],
  sources: [
    {
      id: "source/construct",
      label: "Construct project",
      description: "Construct 3 project",
      icon: { type: "icon", icon: "pi pi-box" },
      output: { kind: "application", platform: "web", container: "directory" },
      defaultConfig: { path: "", profilePath: "" },
      fields: [
        {
          key: "path",
          type: "file",
          label: "Project file",
          required: true,
          fileExtensions: ["c3p"],
        },
        {
          key: "profilePath",
          type: "select",
          label: "Browser profile",
          required: true,
          deferUntilEditor: true,
        },
      ],
    },
    {
      id: "source/godot",
      label: "Godot project",
      output: { kind: "project", technology: "godot", container: "directory" },
      defaultConfig: { path: "" },
      fields: [
        {
          key: "path",
          type: "directory",
          label: "Project path",
          required: true,
        },
      ],
    },
  ],
  producers: [],
  destinations: [
    {
      id: "destination/upload",
      label: "Upload",
      icon: { type: "image", image: "https://example.com/upload.svg" },
      accepts: {},
      defaultConfig: { project: "" },
    },
    { id: "destination/store", label: "Store", accepts: {}, defaultConfig: {} },
  ],
};

const project = { kind: "project", container: "directory" } as const;
const sourceDefinition = {
  id: "source/godot",
  label: "Godot project",
  output: project,
  createDefaultConfig: () => ({ path: "" }),
  validate: () => [],
  compile: () => ({ steps: [], artifact: null as never }),
};
const registry = (
  destinationAccepts: ReleaseRegistry["destinations"][number]["accepts"],
): ReleaseRegistry => ({
  sources: [sourceDefinition],
  producers: [],
  destinations: [
    {
      id: "destination/upload",
      label: "Upload",
      accepts: destinationAccepts,
      createDefaultConfig: () => ({}),
      validate: () => [],
      compile: () => [],
    },
  ],
});
const planningContext = { host: { platform: "linux", architecture: "x64" } };

describe("ReleaseFlowWizard state", () => {
  it("starts on the first of three steps with no source preselected", () => {
    const draft = createReleaseWizardDraft();
    expect(RELEASE_WIZARD_STEPS).toEqual(["details", "destinations", "recap"]);
    expect(draft.source.provider).toBe("");
    expect(releaseWizardHasSource(draft.source, catalog)).toBe(false);
  });

  it("navigates forward and back through the three steps", () => {
    expect(releaseWizardNextStep("details")).toBe("destinations");
    expect(releaseWizardNextStep("destinations")).toBe("recap");
    expect(releaseWizardPreviousStep("recap")).toBe("destinations");
    expect(releaseWizardPreviousStep("destinations")).toBe("details");
  });

  it("reactively enables Continue after an explicit source selection without requiring a path", () => {
    const source = reactive({
      provider: "",
      config: { path: "" },
    });
    const ready = computed(() => releaseWizardHasSource(source, catalog));

    expect(ready.value).toBe(false);
    source.provider = "source/construct";
    expect(ready.value).toBe(true);
  });

  it("requires a name, an explicit source, and a destination but defers source fields to Configuration", () => {
    const draft = createReleaseWizardDraft();
    expect(releaseWizardCanReview(draft, catalog)).toBe(false);
    draft.name = "Game release";
    draft.source = {
      provider: "source/construct",
      config: { path: "", profilePath: "" },
    };
    expect(releaseWizardCanReview(draft, catalog)).toBe(false);
    draft.destinations.push(releaseWizardDestination("destination/upload", catalog)!);
    expect(releaseWizardCanReview(draft, catalog)).toBe(true);
    expect(draft.source.config.path).toBe("");
    expect(buildReleaseWizardConfig(draft, "project-1", "release-1").source).toEqual({
      provider: "source/construct",
      config: { path: "", profilePath: "" },
    });
  });

  it("creates only selected destinations with safe defaults and leaves routes unset", () => {
    const destination = releaseWizardDestination("destination/upload", catalog);
    expect(destination).toEqual({
      id: "destination/upload",
      provider: "destination/upload",
      enabled: true,
      config: { project: "" },
      slots: [{ id: "output", enabled: true, config: {} }],
    });
    expect(destination?.slots[0].input).toBeUndefined();
    if (destination) destination.config.project = "changed";
    expect(catalog.destinations[0].defaultConfig.project).toBe("");
    expect(releaseWizardDestination("missing", catalog)).toBeUndefined();
  });

  it("builds a read-only recap from the chosen name, source, and destinations", () => {
    const draft = createReleaseWizardDraft();
    draft.name = "  Game release  ";
    draft.source = {
      provider: "source/construct",
      config: { path: "/game.c3p", profilePath: "" },
    };
    draft.destinations = [releaseWizardDestination("destination/upload", catalog)!];
    expect(releaseWizardRecap(draft, catalog)).toEqual({
      name: "Game release",
      sourceLabel: "Construct project",
      sourceIcon: { type: "icon", icon: "pi pi-box" },
      sourcePath: "/game.c3p",
      destinations: [
        {
          provider: "destination/upload",
          label: "Upload",
          icon: { type: "image", image: "https://example.com/upload.svg" },
        },
      ],
    });
    const config = buildReleaseWizardConfig(draft, "project-1", "release-1");
    expect(config.builds).toEqual([]);
    expect(config.destinations[0].slots[0].input).toBeUndefined();
    expect(config.destinations).not.toBe(draft.destinations);
    config.destinations[0].config.project = "changed";
    expect(draft.destinations[0].config.project).toBe("");
    config.source.config.path = "/changed.c3p";
    expect(draft.source.config.path).toBe("/game.c3p");
  });

  it("reactively updates recap after name, source path, and destination edits", () => {
    const draft = reactive(createReleaseWizardDraft());
    draft.source = {
      provider: "source/construct",
      config: { path: "", profilePath: "" },
    };
    const recap = computed(() => releaseWizardRecap(draft, catalog));

    expect(recap.value.sourcePath).toBe("");
    expect(recap.value.destinations).toEqual([]);
    draft.name = "Game release";
    draft.source.config.path = "/game.c3p";
    draft.destinations.push(releaseWizardDestination("destination/upload", catalog)!);

    expect(recap.value).toEqual({
      name: "Game release",
      sourceLabel: "Construct project",
      sourceIcon: { type: "icon", icon: "pi pi-box" },
      sourcePath: "/game.c3p",
      destinations: [
        {
          provider: "destination/upload",
          label: "Upload",
          icon: { type: "image", image: "https://example.com/upload.svg" },
        },
      ],
    });
  });

  it("lets the existing defaults policy route a compatible source without adding a build", () => {
    const draft = createReleaseWizardDraft();
    draft.name = "Godot release";
    draft.source = { provider: "source/godot", config: { path: "/game" } };
    draft.destinations = [releaseWizardDestination("destination/upload", catalog)!];

    const resolved = resolveReleaseDefaults(
      buildReleaseWizardConfig(draft, "project-1", "release-1"),
      registry({ kind: "project" }),
      planningContext,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(resolved.destinations[0].slots[0].input).toEqual({ source: true });
  });

  it("keeps an unresolved destination output unset when no default is compatible", () => {
    const draft = createReleaseWizardDraft();
    draft.name = "Godot release";
    draft.source = { provider: "source/godot", config: { path: "/game" } };
    draft.destinations = [releaseWizardDestination("destination/upload", catalog)!];

    const resolved = resolveReleaseDefaults(
      buildReleaseWizardConfig(draft, "project-1", "release-1"),
      registry({ kind: "application" }),
      planningContext,
    );

    expect(resolved.builds).toHaveLength(0);
    expect(resolved.destinations[0].slots[0].input).toBeUndefined();
  });
});
