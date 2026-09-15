import { array, boolean, literal, object, optional, string, union, InferInput } from "valibot";

export const WorkflowSourceValidator = union([
  object({
    type: literal("construct3"),
    path: string(),
    profilePath: optional(string()),
    version: optional(string()),
  }),
  object({ type: literal("folder"), path: string() }),
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
    destinations: [] as WorkflowDestination[],
    continueOnError: true,
  } satisfies WorkflowConfig,
  migrate: async (value: unknown) => value as WorkflowConfig,
};
