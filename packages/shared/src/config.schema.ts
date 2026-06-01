import {
  union,
  literal,
  InferInput,
  string,
  boolean,
  object,
  number,
  array,
  GenericSchema,
  optional,
  looseObject,
} from "valibot";

export const createVersionSchema = <T extends GenericSchema<any, any>>(schema: T) => schema;

export const AppSettingsValidatorV1 = object({
  cacheFolder: string(),
  theme: union([literal("light"), literal("dark")]),
  version: literal("1.0.0"),
});

export const AppSettingsValidatorV2 = object({
  cacheFolder: string(),
  theme: union([literal("light"), literal("dark")]),
  version: literal("2.0.0"),
});

export const AppSettingsValidatorV3 = object({
  cacheFolder: string(),
  theme: union([literal("light"), literal("dark")]),
  version: literal("3.0.0"),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
});

export const AppSettingsValidatorV4 = object({
  theme: union([literal("light"), literal("dark")]),
  version: literal("4.0.0"),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal("en-US"),
    literal("fr-FR"),
    literal("pt-BR"),
    literal("zh-CN"),
    literal("es-ES"),
    literal("de-DE"),
  ]),
});

export const AppSettingsValidatorV5 = object({
  theme: union([literal("light"), literal("dark")]),
  version: literal("5.0.0"),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal("en-US"),
    literal("fr-FR"),
    literal("pt-BR"),
    literal("zh-CN"),
    literal("es-ES"),
    literal("de-DE"),
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean(),
    }),
    editor: object({
      step: number(),
      completed: boolean(),
    }),
  }),
});

export const AppSettingsValidatorV6 = object({
  theme: union([literal("light"), literal("dark")]),
  version: literal("6.0.0"),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal("en-US"),
    literal("fr-FR"),
    literal("pt-BR"),
    literal("zh-CN"),
    literal("es-ES"),
    literal("de-DE"),
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean(),
    }),
    editor: object({
      step: number(),
      completed: boolean(),
    }),
  }),
  autosave: boolean(),
});

export const AppSettingsValidatorV7 = object({
  theme: union([literal("light"), literal("dark")]),
  version: literal("7.0.0"),
  locale: union([
    literal("en-US"),
    literal("fr-FR"),
    literal("pt-BR"),
    literal("zh-CN"),
    literal("es-ES"),
    literal("de-DE"),
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean(),
    }),
    editor: object({
      step: number(),
      completed: boolean(),
    }),
  }),
  autosave: boolean(),
  agents: array(
    object({
      id: string(),
      name: string(),
      url: string(),
    }),
  ),
  buildHistory: object({
    retentionPolicy: object({
      enabled: boolean(),
      maxEntries: number(), // Maximum number of entries per pipeline
      maxAge: number(), // Maximum age of entries in days
    }),
  }),
});

export const AppSettingsValidatorV8 = object({
  theme: union([literal("light"), literal("dark")]),
  version: literal("8.0.0"),
  locale: union([
    literal("en-US"),
    literal("fr-FR"),
    literal("pt-BR"),
    literal("zh-CN"),
    literal("es-ES"),
    literal("de-DE"),
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean(),
    }),
    editor: object({
      step: number(),
      completed: boolean(),
    }),
  }),
  autosave: boolean(),
  agents: array(
    object({
      id: string(),
      name: string(),
      url: string(),
    }),
  ),
  buildHistory: object({
    retentionPolicy: object({
      enabled: boolean(),
      maxEntries: number(), // Maximum number of entries per pipeline
      maxAge: number(), // Maximum age of entries in days
    }),
  }),
  // Metadata list of plugins the user has enabled (official + community).
  // No binaries are stored here — versions are resolved JIT at node-add time.
  plugins: array(
    object({
      name: string(),
      enabled: boolean(),
      description: string(),
    }),
  ),
  isInternalMigrationBannerClosed: optional(boolean(), false),
});

export const ConnectionValidator = looseObject({
  id: string(),
  pluginName: string(),
  name: string(),
  createdAt: string(),
  isDefault: boolean(),
});

export const ConnectionsValidatorV1 = object({
  version: literal("1.0.0"),
  connections: array(ConnectionValidator),
});

export type Connection = InferInput<typeof ConnectionValidator>;
export type ConnectionsConfigV1 = InferInput<typeof ConnectionsValidatorV1>;
export type ConnectionsConfig = ConnectionsConfigV1;
export const ConnectionsValidator = ConnectionsValidatorV1;

export type AppConfigV1 = InferInput<typeof AppSettingsValidatorV1>;
export type AppConfigV2 = InferInput<typeof AppSettingsValidatorV2>;
export type AppConfigV3 = InferInput<typeof AppSettingsValidatorV3>;
export type AppConfigV4 = InferInput<typeof AppSettingsValidatorV4>;
export type AppConfigV5 = InferInput<typeof AppSettingsValidatorV5>;
export type AppConfigV6 = InferInput<typeof AppSettingsValidatorV6>;
export type AppConfigV7 = InferInput<typeof AppSettingsValidatorV7>;
export type AppConfigV8 = InferInput<typeof AppSettingsValidatorV8>;

export type AppConfig = AppConfigV8;
export const AppSettingsValidator = AppSettingsValidatorV8;
