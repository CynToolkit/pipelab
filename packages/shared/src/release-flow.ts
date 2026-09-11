import { array, boolean, literal, object, optional, string, union, InferInput } from "valibot";

export const ReleaseFlowSourceValidator = union([
  object({
    type: literal("construct3"),
    path: string(),
    profileConnectionId: optional(string()),
    version: optional(string()),
  }),
  object({ type: literal("folder"), path: string() }),
]);

export const ReleaseFlowDestinationValidator = union([
  object({
    type: literal("steam"),
    sdkConnectionId: optional(string()),
    accountConnectionId: optional(string()),
    appId: string(),
    depotId: string(),
    description: string(),
    appName: string(),
    appBundleId: string(),
    appVersion: string(),
    icon: optional(string()),
    branch: optional(string()),
  }),
  object({
    type: literal("itch"),
    accountConnectionId: string(),
    user: string(),
    project: string(),
    channel: string(),
  }),
  object({
    type: literal("web"),
    outputDir: string(),
    overwrite: boolean(),
    cleanup: boolean(),
  }),
]);

export const ReleaseFlowValidator = object({
  version: literal("1.0.0"),
  id: string(),
  project: string(),
  name: string(),
  description: optional(string()),
  source: ReleaseFlowSourceValidator,
  destinations: array(ReleaseFlowDestinationValidator),
  continueOnError: optional(boolean(), true),
  osOverrides: optional(
    object({
      windows: optional(object({ outputDir: optional(string()), path: optional(string()) })),
      macos: optional(object({ outputDir: optional(string()), path: optional(string()) })),
      linux: optional(object({ outputDir: optional(string()), path: optional(string()) })),
    }),
  ),
});

export type ReleaseFlowSource = InferInput<typeof ReleaseFlowSourceValidator>;
export type ReleaseFlowDestination = InferInput<typeof ReleaseFlowDestinationValidator>;
export type ReleaseFlow = InferInput<typeof ReleaseFlowValidator>;

export const releaseFlowMigrator = {
  defaultValue: {
    version: "1.0.0" as const,
    id: "",
    project: "",
    name: "",
    description: "",
    source: { type: "folder" as const, path: "" },
    destinations: [] as ReleaseFlowDestination[],
    continueOnError: true,
  } satisfies ReleaseFlow,
  migrate: async (value: unknown) => value as ReleaseFlow,
};
