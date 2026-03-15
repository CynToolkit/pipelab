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
  agents: array(
    object({
      id: string(),
      name: string(),
      url: string(),
    }),
  ),
});

export type AppConfigV1 = InferInput<typeof AppSettingsValidatorV1>;
export type AppConfigV2 = InferInput<typeof AppSettingsValidatorV2>;
export type AppConfigV3 = InferInput<typeof AppSettingsValidatorV3>;
export type AppConfigV4 = InferInput<typeof AppSettingsValidatorV4>;
export type AppConfigV5 = InferInput<typeof AppSettingsValidatorV5>;
export type AppConfigV6 = InferInput<typeof AppSettingsValidatorV6>;
export type AppConfigV7 = InferInput<typeof AppSettingsValidatorV7>;

export type AppConfig = AppConfigV7;
export const AppSettingsValidator = AppSettingsValidatorV7;
