import { getSystemContext } from './context'
import path from 'node:path'
import { ensure } from './fs-utils'
import fs from 'node:fs/promises'
import { useLogger } from '@pipelab/shared/logger'
import { configRegistry, Migrator } from '@pipelab/shared/config'

export const setupConfigFile = async <T>(name: string) => {
  const migrator = configRegistry[name] as Migrator<T>
  
  if (!migrator) {
    throw new Error(`No migrator found for configuration: ${name}. All managed files must have a migration schema.`)
  }

  const userData = getSystemContext().userDataPath
  const filesPath = path.join(userData, 'config', `${name}.json`)
  
  await ensure(filesPath, JSON.stringify(migrator.defaultValue))

  return {
    setConfig: async (config: T) => {
      const { logger } = useLogger()
      try {
        await fs.writeFile(filesPath, JSON.stringify(config))
        return true
      } catch (e) {
        logger().error(`Error saving config ${name}:`, e)
        return false
      }
    },
    getConfig: async () => {
      const { logger } = useLogger()
      let content = undefined
      try {
        content = await fs.readFile(filesPath, 'utf8')
      } catch (e) {
        logger().error(`Error reading config ${name}:`, e)
      }

      let json = undefined
      try {
        json = await migrator.migrate(
          content === undefined ? undefined : JSON.parse(content),
          { debug: true }
        )
      } catch (e) {
        logger().error(`Error migrating config ${name}:`, e)
        json = migrator.defaultValue
      }

      // Save back migrated config
      try {
        await fs.writeFile(filesPath, JSON.stringify(json))
      } catch (e) {
        logger().error(`Error saving migrated config ${name}:`, e)
      }

      return json as T
    }
  }
}
