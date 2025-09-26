import { Pipeline } from '@@/types'
import { app } from 'electron'
import { join } from 'node:path'
import { ensure } from './utils'
import { readFile, writeFile } from 'node:fs/promises'
import { useLogger } from '@@/logger'

const getBuildsFilePath = () => {
  const userData = app.getPath('userData')
  return join(userData, 'config', 'builds.json')
}

export const setupBuilds = async () => {
  const buildsPath = getBuildsFilePath()
  await ensure(buildsPath, '[]')

  return {
    saveBuild: async (build: Pipeline) => {
      const { logger } = useLogger()
      try {
        const builds = await getBuilds()
        builds.push(build)
        await writeFile(buildsPath, JSON.stringify(builds, null, 2))
        return true
      } catch (e) {
        logger().error('e', e)
        return false
      }
    },
    getBuilds: async (): Promise<Pipeline[]> => {
      const { logger } = useLogger()
      try {
        const content = await readFile(buildsPath, 'utf8')
        return JSON.parse(content)
      } catch (e) {
        logger().error('e', e)
        return []
      }
    }
  }
}

const getBuilds = async (): Promise<Pipeline[]> => {
  const { logger } = useLogger()
  const buildsPath = getBuildsFilePath()
  try {
    const content = await readFile(buildsPath, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    logger().error('e', e)
    return []
  }
}