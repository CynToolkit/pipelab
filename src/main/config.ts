import { createMigration, createMigrator, finalVersion, initialVersion } from '@@/libs/migration'
import { createVersionSchema, OmitVersion } from '@@/libs/migration/models/migration'
import { app } from 'electron'
import { join } from 'node:path'
import { string, union, literal, InferInput, boolean } from 'valibot'
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

export type AppConfigV1 = InferInput<typeof AppSettingsValidatorV1>
export type AppConfigV2 = InferInput<typeof AppSettingsValidatorV2>
export type AppConfigV3 = InferInput<typeof AppSettingsValidatorV3>

export type AppConfig = AppConfigV3
export const AppSettingsValidator = AppSettingsValidatorV3

const migrator = createMigrator<AppConfigV1, AppConfig>()

const defaultCacheFolder = join(tmpdir(), 'pipelab')

export const defaultAppSettings = migrator.createDefault({
  cacheFolder: defaultCacheFolder,
  theme: 'light',
  version: '1.0.0'
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
    createMigration<AppConfigV2, AppConfigV3, never>({
      version: '3.0.0',
      up: finalVersion,
      down: () => {
        throw new Error("Can't migrate down from 3.0.0")
      }
    })
    // createMigration<SavedFileV1, SavedFileV2, SavedFileV3>({
    //   version: '2.0.0',
    //   up: (state) => {
    //     const { canvas, ...rest } = state
    //     const { blocks, triggers } = canvas
    //     const newBlocks: SavedFileV2['canvas']['blocks'] = []
    //     for (const block of blocks) {
    //       const newParams: SavedFileV2['canvas']['blocks'][number]['params'] = {}
    //       for (const data of Object.entries(block.params)) {
    //         if (data === undefined) {
    //           throw new Error("Can't migrate block with undefined params")
    //         } else {
    //           const [key, value] = data
    //           newParams[key] = {
    //             editor: 'editor',
    //             value
    //           }
    //         }
    //       }
    //       newBlocks.push({
    //         ...block,
    //         params: newParams
    //       })
    //     }
    //     return {
    //       ...rest,
    //       canvas: {
    //         triggers,
    //         blocks: newBlocks
    //       },
    //     } satisfies OmitVersion<SavedFileV3>
    //   },
    //   down: () => {
    //     throw new Error('Migration down not implemented')
    //   }
    // }),
    // createMigration<SavedFileV2, SavedFileV3, SavedFileV3>({
    //   version: '3.0.0',
    //   up: finalVersion,
    //   down: () => {
    //     throw new Error('Migration down not implemented')
    //   }
    // })
  ]
})

export const getDefaultAppSettingsMigrated = () => appSettingsMigrator.migrate(defaultAppSettings)

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

      const json = await appSettingsMigrator.migrate(
        content === undefined ? content : JSON.parse(content),
        { debug: true }
      )

      logger().info('json', json)

      try {
        await writeFile(filesPath, JSON.stringify(json))
      } catch (e) {
        logger().error('e', e)
      }

      console.log('json', json)
      return json
    }
  }
}
