import { useAPI } from '../ipc-core'
import { useLogger } from '@pipelab/shared/logger'
import { writeFile, readFile } from 'node:fs/promises'

export const registerFsHandlers = () => {
  const { handle } = useAPI()
  const { logger } = useLogger()

  handle('fs:read', async (event, { value, send }) => {
    logger().info('fs:read', value.path)

    try {
      const data = await readFile(value.path, 'utf-8')
      logger().info('fs:read success, content length:', data.length)

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            content: data
          }
        }
      })
    } catch (e) {
      logger().error('fs:read error for path:', value.path, e)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: 'Unable to read file'
        }
      })
    }
  })

  handle('fs:write', async (event, { value, send }) => {
    await writeFile(value.path, value.content, 'utf-8')

    send({
      type: 'end',
      data: {
        type: 'success',
        result: {
          ok: true
        }
      }
    })
  })

  handle('fs:listDirectory', async (event, { value, send }) => {
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')

    try {
      const entries = await readdir(value.path, { withFileTypes: true })
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(value.path, entry.name)
          let stats: any = {}
          try {
            stats = await stat(fullPath)
          } catch (e) {
            // Might happen for broken symlinks etc
          }

          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isSymbolicLink: entry.isSymbolicLink(),
            size: stats.size || 0,
            mtime: stats.mtime?.getTime() || 0
          }
        })
      )

      send({
        type: 'end',
        data: {
          type: 'success',
          result: {
            files
          }
        }
      })
    } catch (error) {
      logger().error('Failed to list directory:', error)
      send({
        type: 'end',
        data: {
          type: 'error',
          ipcError: error instanceof Error ? error.message : 'Unable to list directory'
        }
      })
    }
  })
}
