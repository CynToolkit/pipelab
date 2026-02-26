import { union, literal, InferInput, string, boolean, object, number } from 'valibot'
import { createVersionSchema } from '@pipelab/migration/models/migration'

export const AppSettingsValidatorV1 = createVersionSchema({
  cacheFolder: string(),
  theme: union([literal('light'), literal('dark')]),
  version: literal('1.0.0')
})

export const AppSettingsValidatorV2 = createVersionSchema({
  cacheFolder: string(),
  theme: union([literal('light'), literal('dark')]),
  version: literal('2.0.0')
})

export const AppSettingsValidatorV3 = createVersionSchema({
  cacheFolder: string(),
  theme: union([literal('light'), literal('dark')]),
  version: literal('3.0.0'),
  clearTemporaryFoldersOnPipelineEnd: boolean()
})

export const AppSettingsValidatorV4 = createVersionSchema({
  theme: union([literal('light'), literal('dark')]),
  version: literal('4.0.0'),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal('en-US'),
    literal('fr-FR'),
    literal('pt-BR'),
    literal('zh-CN'),
    literal('es-ES'),
    literal('de-DE')
  ])
})

export const AppSettingsValidatorV5 = createVersionSchema({
  theme: union([literal('light'), literal('dark')]),
  version: literal('5.0.0'),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal('en-US'),
    literal('fr-FR'),
    literal('pt-BR'),
    literal('zh-CN'),
    literal('es-ES'),
    literal('de-DE')
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean()
    }),
    editor: object({
      step: number(),
      completed: boolean()
    })
  })
})

export const AppSettingsValidatorV6 = createVersionSchema({
  theme: union([literal('light'), literal('dark')]),
  version: literal('6.0.0'),
  cacheFolder: string(),
  clearTemporaryFoldersOnPipelineEnd: boolean(),
  locale: union([
    literal('en-US'),
    literal('fr-FR'),
    literal('pt-BR'),
    literal('zh-CN'),
    literal('es-ES'),
    literal('de-DE')
  ]),
  tours: object({
    dashboard: object({
      step: number(),
      completed: boolean()
    }),
    editor: object({
      step: number(),
      completed: boolean()
    })
  }),
  autosave: boolean()
})

export type AppConfigV1 = InferInput<typeof AppSettingsValidatorV1>
export type AppConfigV2 = InferInput<typeof AppSettingsValidatorV2>
export type AppConfigV3 = InferInput<typeof AppSettingsValidatorV3>
export type AppConfigV4 = InferInput<typeof AppSettingsValidatorV4>
export type AppConfigV5 = InferInput<typeof AppSettingsValidatorV5>
export type AppConfigV6 = InferInput<typeof AppSettingsValidatorV6>

export type AppConfig = AppConfigV6
export const AppSettingsValidator = AppSettingsValidatorV6
