import { handleSteamRequest } from './utils.js'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

/**
 * Save screenshot from base64 data URL to Steam library
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 * @param {Object} json
 * @returns {Promise<number>} The screenshot handle
 */
const saveScreenshotHandler = async (client, json) => {
  const { body } = json
  const { dataUrl, width, height } = body

  // Validate input
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('dataUrl is required and must be a string')
  }

  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('dataUrl must be a base64 data URL (data:image/...)')
  }

  // Extract base64 data
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid base64 data URL format')
  }

  const [, format, base64Data] = matches
  const buffer = Buffer.from(base64Data, 'base64')

  // Create temp file
  const tempDir = join(tmpdir(), 'pipelab-screenshots')
  mkdirSync(tempDir, { recursive: true })
  const tempPath = join(tempDir, `screenshot-${randomUUID()}.${format}`)

  try {
    // Write to temp file
    writeFileSync(tempPath, buffer)

    // Add to Steam library
    const handle = client.screenshots.addScreenshotToLibrary(tempPath, null, width, height)

    return handle
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * @param {Object} json
 * @param {import('ws').WebSocket} ws
 * @param {Omit<import('@pipelab/steamworks.js').Client, "init" | "runCallbacks">} client
 */
export default async (json, ws, client) => {
  await handleSteamRequest(client, json, ws, saveScreenshotHandler)
}
