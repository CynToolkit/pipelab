import { describe, expect, it } from "vitest";
import { computed, reactive } from "vue";
import { resolveReleaseDefaults } from "@pipelab/shared";
import type { ReleaseCatalog, ReleaseRegistry } from "@pipelab/shared";
import { invalidEnvironmentBindingPaths } from "../utils/environment-bindings";
import {
  buildReleaseWizardConfig,
  chooseReleaseWizardSource,
  createReleaseWizardDraft,
  HOSTED_RELEASE_WIZARD_STEPS,
  RELEASE_WIZARD_STEPS,
  releaseWizardCanContinueDetails,
  releaseWizardCanReview,
  releaseWizardCanCreate,
  releaseWizardDestination,
  releaseWizardHasSource,
  releaseWizardIsOfflineBrowserDraft,
  releaseWizardNextStep,
  releaseWizardPreviousStep,
  releaseWizardRecap,
  releaseWizardSourceIsReady,
  releaseWizardTargetAvailability,
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
  it("blocks workflow creation while environment binding names are invalid", () => {
    const state = {
      isReady: true,
      projectId: "project-1",
      canContinueDestinations: true,
      createPending: false,
    };

    expect(releaseWizardCanCreate({ ...state, invalidEnvironmentBindingCount: 1 })).toBe(false);
    expect(releaseWizardCanCreate({ ...state, invalidEnvironmentBindingCount: 0 })).toBe(true);
  });

  it.each([
    { isReady: false },
    { projectId: undefined },
    { canContinueDestinations: false },
    { createPending: true },
  ])("preserves existing workflow creation gates: %o", (override) => {
    expect(
      releaseWizardCanCreate({
        isReady: true,
        projectId: "project-1",
        canContinueDestinations: true,
        createPending: false,
        invalidEnvironmentBindingCount: 0,
        ...override,
      }),
    ).toBe(false);
  });

  it("updates the create gate as environment bindings in the reactive draft are corrected", () => {
    const draft = reactive(createReleaseWizardDraft());
    const invalidEnvironmentBindingCount = computed(
      () => invalidEnvironmentBindingPaths(draft).length,
    );
    const state = {
      isReady: true,
      projectId: "project-1",
      canContinueDestinations: true,
      createPending: false,
    };

    draft.source.config.path = "${{ env.BAD-NAME }}";
    expect(invalidEnvironmentBindingCount.value).toBe(1);
    expect(
      releaseWizardCanCreate({
        ...state,
        invalidEnvironmentBindingCount: invalidEnvironmentBindingCount.value,
      }),
    ).toBe(false);

    draft.source.config.path = "${{ env.BUILD_PATH }}";
    expect(invalidEnvironmentBindingCount.value).toBe(0);
    expect(
      releaseWizardCanCreate({
        ...state,
        invalidEnvironmentBindingCount: invalidEnvironmentBindingCount.value,
      }),
    ).toBe(true);
  });

  it("starts on the first of four steps with no source preselected", () => {
    const draft = createReleaseWizardDraft();
    expect(RELEASE_WIZARD_STEPS).toEqual(["details", "source", "destinations", "recap"]);
    expect(draft.source.provider).toBe("");
    expect(releaseWizardHasSource(draft.source, catalog)).toBe(false);
  });

  it("navigates forward and back through setup, destinations, and recap", () => {
    expect(releaseWizardNextStep("details")).toBe("source");
    expect(releaseWizardNextStep("source")).toBe("destinations");
    expect(releaseWizardNextStep("destinations")).toBe("recap");
    expect(releaseWizardPreviousStep("recap")).toBe("destinations");
    expect(releaseWizardPreviousStep("destinations")).toBe("source");
    expect(releaseWizardPreviousStep("source")).toBe("details");
  });

  it("suggests workflow aliases for required source and destination Connections", () => {
    const connectionCatalog: ReleaseCatalog = {
      ...catalog,
      sources: [
        {
          id: "source/construct-account",
          label: "Construct",
          output: { kind: "project", container: "directory" },
          defaultConfig: { account: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "Construct account",
              integration: "Construct Account",
              required: true,
            },
          ],
        },
      ],
      destinations: [
        {
          id: "destination/itch",
          label: "Itch",
          accepts: {},
          defaultConfig: { account: "" },
          fields: [
            {
              key: "account",
              type: "connection",
              label: "Itch account",
              integration: "Itch Account",
              required: true,
            },
          ],
        },
      ],
    };
    const draft = createReleaseWizardDraft();
    draft.name = "Game release";
    chooseReleaseWizardSource(draft, "source/construct-account", connectionCatalog);
    const destination = releaseWizardDestination("destination/itch", connectionCatalog)!;

    const built = buildReleaseWizardConfig(draft, "project-1", "release-1", connectionCatalog);

    expect(draft.source.config.account).toBe("construct-account");
    expect(built.source.config.account).toBe("construct-account");
    expect(destination.config.account).toBe("itch-account");
  });

  it("includes an editable hosted build in the draft config", () => {
    const draft = createReleaseWizardDraft();
    draft.name = "Browser draft";
    draft.builds = [
      {
        id: "build-1",
        type: "desktop",
        engine: "producer/electron",
        enabled: true,
        config: { mode: "release" },
        targets: [{ id: "linux", enabled: true, config: { format: "appimage" } }],
      },
    ];

    expect(HOSTED_RELEASE_WIZARD_STEPS).toEqual([
      "details",
      "source",
      "builds",
      "destinations",
      "recap",
    ]);
    expect(releaseWizardNextStep("source", HOSTED_RELEASE_WIZARD_STEPS)).toBe("builds");
    expect(buildReleaseWizardConfig(draft, "project-1", "release-1").builds).toEqual(draft.builds);
  });

  it("uses live readiness for browser draft controls, independent of startup policy", () => {
    expect(releaseWizardIsOfflineBrowserDraft(true, false)).toBe(true);
    expect(releaseWizardIsOfflineBrowserDraft(true, true)).toBe(false);
    expect(releaseWizardIsOfflineBrowserDraft(false, false)).toBe(false);
  });

  it("shows live target availability after the agent attaches", () => {
    const target = {
      id: "linux",
      label: "Linux",
      defaultConfig: {},
      availabilityStatus: "unknown" as const,
    };

    expect(releaseWizardTargetAvailability(target, false)).toBe(
      "Availability: Unknown (agent required)",
    );
    expect(
      releaseWizardTargetAvailability(
        {
          ...target,
          availabilityStatus: undefined,
          availability: { available: false, reason: "SDK not installed" },
        },
        true,
      ),
    ).toBe("Unavailable: SDK not installed");
    expect(
      releaseWizardTargetAvailability(
        {
          ...target,
          availabilityStatus: undefined,
          availability: { available: true },
        },
        true,
      ),
    ).toBe("Available on this device");
  });

  it("requires a name on the first step and keeps description optional", () => {
    const draft = createReleaseWizardDraft();
    expect(releaseWizardCanContinueDetails(draft)).toBe(false);
    draft.description = "An optional release description";
    expect(releaseWizardCanContinueDetails(draft)).toBe(false);
    draft.name = "Game release";
    expect(releaseWizardCanContinueDetails(draft)).toBe(true);
  });

  it("reactively enables source-step Continue after a required path is selected", () => {
    const source = reactive({
      provider: "source/construct",
      config: { path: "" },
    });
    const ready = computed(() => releaseWizardSourceIsReady(source, catalog));

    expect(ready.value).toBe(false);
    source.config.path = "/game.c3p";
    expect(ready.value).toBe(true);
  });

  it("requires name, a valid source path, and a destination before review", () => {
    const draft = createReleaseWizardDraft();
    expect(releaseWizardCanReview(draft, catalog)).toBe(false);
    draft.name = "Game release";
    draft.description = "Optional details";
    draft.source = {
      provider: "source/construct",
      config: { path: "", profilePath: "" },
    };
    expect(releaseWizardCanReview(draft, catalog)).toBe(false);
    draft.source.config.path = "/game.c3p";
    expect(releaseWizardCanReview(draft, catalog)).toBe(false);
    draft.destinations.push(releaseWizardDestination("destination/upload", catalog)!);
    expect(releaseWizardCanReview(draft, catalog)).toBe(true);
    expect(buildReleaseWizardConfig(draft, "project-1", "release-1").source).toEqual({
      provider: "source/construct",
      config: { path: "/game.c3p", profilePath: "" },
    });
    expect(buildReleaseWizardConfig(draft, "project-1", "release-1").description).toBe(
      "Optional details",
    );
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
    draft.description = "  A test description  ";
    draft.source = {
      provider: "source/construct",
      config: { path: "/game.c3p", profilePath: "" },
    };
    draft.destinations = [releaseWizardDestination("destination/upload", catalog)!];
    expect(releaseWizardRecap(draft, catalog)).toEqual({
      name: "Game release",
      description: "A test description",
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
    expect(config.description).toBe("A test description");
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
    draft.description = "Optional details";
    draft.source.config.path = "/game.c3p";
    draft.destinations.push(releaseWizardDestination("destination/upload", catalog)!);

    expect(recap.value).toEqual({
      name: "Game release",
      description: "Optional details",
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
