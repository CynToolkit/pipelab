import { createMigration, createMigrator, finalVersion, initialVersion } from '@@/libs/migration'
import { createVersionSchema, OmitVersion } from '@@/libs/migration/models/migration'
import { app } from 'electron'
import { join } from 'node:path'
import { union, literal, InferInput, string, boolean, object, number } from 'valibot'
import { ensure } from './utils'
import { readFile, writeFile } from 'node:fs/promises'
import { useLogger } from '@@/logger'
import { tmpdir } from 'node:os'

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

export type AppConfigV1 = InferInput<typeof AppSettingsValidatorV1>
export type AppConfigV2 = InferInput<typeof AppSettingsValidatorV2>
export type AppConfigV3 = InferInput<typeof AppSettingsValidatorV3>
export type AppConfigV4 = InferInput<typeof AppSettingsValidatorV4>
export type AppConfigV5 = InferInput<typeof AppSettingsValidatorV5>

export type AppConfig = AppConfigV5
export const AppSettingsValidator = AppSettingsValidatorV5

const migrator = createMigrator<AppConfigV1, AppConfig>()

const defaultCacheFolder = join(tmpdir(), 'pipelab')

export const defaultAppSettings = migrator.createDefault({
  cacheFolder: defaultCacheFolder,
  clearTemporaryFoldersOnPipelineEnd: false,
  locale: 'en-US',
  theme: 'light',
  version: '5.0.0',
  tours: {
    dashboard: {
      step: 0,
      completed: false
    },
    editor: {
      step: 0,
      completed: false
    }
  }
})

export const appSettingsMigrator = migrator.createMigrations({
  defaultValue: defaultAppSettings,
  migrations: [
    createMigration<never, AppConfigV1, AppConfigV2>({
      version: '1.0.0',
      up: (state) => state satisfies OmitVersion<AppConfigV2>,
      down: initialVersion
    }),
    createMigration<AppConfigV1, AppConfigV2, AppConfigV3>({
      version: '2.0.0',
      up: (state) => {
        return {
          ...state,
          clearTemporaryFoldersOnPipelineEnd: false
        } satisfies OmitVersion<AppConfigV3>
      },
      down: () => {
        throw new Error("Can't migrate down from 2.0.0")
      }
    }),
    createMigration<AppConfigV2, AppConfigV3, AppConfigV4>({
      version: '3.0.0',
      up: (state) => ({
        ...state,
        locale: 'en-US' as const // Default locale for existing users
      }),
      down: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { locale, ...rest } = state as AppConfigV4
        return rest as unknown as AppConfigV3
      }
    }),
    createMigration<AppConfigV3, AppConfigV4, AppConfigV5>({
      version: '4.0.0',
      up: (state) => ({
        ...state,
        tours: {
          dashboard: {
            step: 0,
            completed: false
          },
          editor: {
            step: 0,
            completed: false
          }
        }
      }),
      down: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tours, ...rest } = state as AppConfigV5
        return rest as unknown as AppConfigV4
      }
    }),
    createMigration<AppConfigV4, AppConfigV5, never>({
      version: '5.0.0',
      up: finalVersion,
      down: () => {
        throw new Error("Can't migrate down from 5.0.0")
      }
    })
  ]
})

export const getDefaultAppSettingsMigrated = () => {
  try {
    return appSettingsMigrator.migrate(defaultAppSettings)
  } catch (e) {
    console.error('Error migrating default app settings', e)
    return defaultAppSettings
  }
}

export const setupConfig = async () => {
  const userData = app.getPath('userData')
  const filesPath = join(userData, 'config', 'settings.json')
  await ensure(filesPath, JSON.stringify(appSettingsMigrator.defaultValue))

  return {
    setConfig: async (config: AppConfig) => {
      const { logger } = useLogger()
      try {
        await writeFile(filesPath, JSON.stringify(config))
        return true
      } catch (e) {
        logger().error('e', e)
        return false
      }
    },
    getConfig: async () => {
      const { logger } = useLogger()

      let content = undefined
      try {
        content = await readFile(filesPath, 'utf8')
      } catch (e) {
        logger().error('e', e)
      }

      logger().info('content', content)

      let json = undefined
      try {
        json = await appSettingsMigrator.migrate(
          content === undefined ? content : JSON.parse(content),
          { debug: true }
        )
      } catch (e) {
        logger().error('e', e)
      }

      try {
        await writeFile(filesPath, JSON.stringify(json))
      } catch (e) {
        logger().error('e', e)
      }

      return json
    }
  }
}
