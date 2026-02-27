import { createMigration, createMigrator, finalVersion, initialVersion } from '@pipelab/migration'
import { OmitVersion } from '@pipelab/migration/models/migration'
import { getSystemContext } from './context'
import { join } from 'node:path'
import { ensure } from './utils'
import { readFile, writeFile } from 'node:fs/promises'
import { useLogger } from '@pipelab/shared/logger'
import { tmpdir } from 'node:os'
import {
  AppConfig,
  AppConfigV1,
  AppConfigV2,
  AppConfigV3,
  AppConfigV4,
  AppConfigV5,
  AppConfigV6,
  AppSettingsValidator
} from '@pipelab/shared/config.schema'

const migrator = createMigrator<AppConfigV1, AppConfig>()

const defaultCacheFolder = join(tmpdir(), 'pipelab')

export const defaultAppSettings = migrator.createDefault({
  cacheFolder: defaultCacheFolder,
  clearTemporaryFoldersOnPipelineEnd: false,
  locale: 'en-US',
  theme: 'light',
  version: '6.0.0',
  autosave: true,
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
    createMigration<AppConfigV4, AppConfigV5, AppConfigV6>({
      version: '5.0.0',
      up: (state) => ({
        ...state,
        autosave: true
      }),
      down: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { autosave, ...rest } = state as AppConfigV6
        return rest as unknown as AppConfigV5
      }
    }),
    createMigration<AppConfigV5, AppConfigV6, never>({
      version: '6.0.0',
      up: finalVersion,
      down: () => {
        throw new Error("Can't migrate down from 6.0.0")
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
  const userData = getSystemContext().userDataPath
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
