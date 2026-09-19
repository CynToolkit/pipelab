import { array, boolean, literal, object, optional, string, union, InferInput } from "valibot";

export const ArtifactOutputIdValidator = union([
  literal("electron.windows"),
  literal("electron.linux"),
  literal("electron.macos.arm64"),
  literal("tauri.windows"),
  literal("tauri.linux"),
  literal("tauri.macos.arm64"),
  literal("web.html5"),
  literal("godot.windows"),
  literal("godot.linux"),
  literal("godot.macos.arm64"),
  literal("godot.web"),
]);
export type ArtifactOutputId = InferInput<typeof ArtifactOutputIdValidator>;

export const WorkflowSourceValidator = union([
  object({
    type: literal("construct3"),
    path: string(),
    profilePath: optional(string()),
    version: optional(string()),
  }),
  object({ type: literal("folder"), path: string() }),
  object({ type: literal("godot"), path: string() }),
]);

export const WorkflowDestinationValidator = union([
  object({
    type: literal("steam"),
    enabled: optional(boolean(), true),
    accountConnectionId: optional(string()),
    appId: string(),
    depotId: string(),
    description: optional(string()),
    appName: optional(string()),
    appBundleId: optional(string()),
    appVersion: optional(string()),
    icon: optional(string()),
    branch: optional(string()),
  }),
  object({
    type: literal("itch"),
    enabled: optional(boolean(), true),
    accountConnectionId: string(),
    project: string(),
    channel: string(),
  }),
  object({
    type: literal("web"),
    enabled: optional(boolean(), true),
    outputDir: string(),
    overwrite: boolean(),
    cleanup: boolean(),
  }),
]);

export const WorkflowConfigValidator = object({
  version: literal("1.0.0"),
  id: string(),
  project: string(),
  name: string(),
  description: optional(string()),
  source: WorkflowSourceValidator,
  outputs: optional(array(ArtifactOutputIdValidator)),
  destinations: array(WorkflowDestinationValidator),
  continueOnError: optional(boolean(), true),
  osOverrides: optional(
    object({
      windows: optional(object({ outputDir: optional(string()), path: optional(string()) })),
      macos: optional(object({ outputDir: optional(string()), path: optional(string()) })),
      linux: optional(object({ outputDir: optional(string()), path: optional(string()) })),
    }),
  ),
});

export type WorkflowSource = InferInput<typeof WorkflowSourceValidator>;
export type WorkflowDestination = InferInput<typeof WorkflowDestinationValidator>;
export type WorkflowConfig = InferInput<typeof WorkflowConfigValidator>;

export const workflowConfigMigrator = {
  defaultValue: {
    version: "1.0.0" as const,
    id: "",
    project: "",
    name: "",
    description: "",
    source: { type: "folder" as const, path: "" },
    outputs: [] as ArtifactOutputId[],
    destinations: [] as WorkflowDestination[],
    continueOnError: true,
  } satisfies WorkflowConfig,
  migrate: async (value: unknown) => value as WorkflowConfig,
};
