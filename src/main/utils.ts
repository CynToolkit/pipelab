import { usePlugins } from '@@/plugins'
import { downloadFile, Hooks, RendererPluginDefinition } from '../shared/libs/plugin-core'
import { access, chmod, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { app, BrowserWindow } from 'electron'
import * as zlib from 'zlib' // For gunzip (used with tar.gz)
import * as tar from 'tar' // Library for tar extraction
import * as yauzl from 'yauzl' // Library for zip extraction
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { throttle } from 'es-toolkit'
import { processGraph } from '@@/graph'
import { handleActionExecute } from './handler-func'
import { useLogger } from '@@/logger'
import { buildHistoryStorage } from './handlers/build-history'
import type { BuildHistoryEntry } from '@@/build-history'
import type { Variable } from '@pipelab/core-app'

export const getFinalPlugins = () => {
  const { plugins } = usePlugins()
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = []

  for (const plugin of Object.values(plugins.value)) {
    const finalNodes: RendererPluginDefinition['nodes'][number][] = []
    // console.log('/*')
    // console.log('node', node.definition)
    // console.log('node', JSON.stringify(node.definition, undefined, 2))
    // console.log('*/')

    // send without runner
    for (const element of plugin.nodes) {
      const { node } = element
      finalNodes.push({
        node
      })
    }

    finalPlugins.push({
      ...plugin,
      nodes: finalNodes
    })
  }

  return finalPlugins
}

export const ensure = async (filesPath: string, defaultContent = '{}') => {
  // create parent folder
  await mkdir(dirname(filesPath), {
    recursive: true
  })

  // ensure file exist
  try {
    await access(filesPath)
  } catch {
    // File doesn't exist, create it
    await writeFile(filesPath, defaultContent) // json
  }
}

export const generateTempFolder = async (base = tmpdir()) => {
  await mkdir(base, {
    recursive: true
  })
  const realPath = await realpath(base)
  console.log('join', join(realPath, 'pipelab-'))
  const tempFolder = await mkdtemp(join(realPath, 'pipelab-'))

  return tempFolder
}

/**
 * Extracts a .tar.gz archive.
 * @param archivePath The full path to the .tar.gz file.
 * @param destinationDir The directory to extract contents into.
 * @returns A Promise that resolves when extraction is complete.
 */
export async function extractTarGz(archivePath: string, destinationDir: string): Promise<void> {
  console.log(`Extracting ${archivePath} to ${destinationDir}...`)

  // Ensure the destination directory exists
  await mkdir(destinationDir, { recursive: true })

  return new Promise((resolve, reject) => {
    const readStream = createReadStream(archivePath) // Use sync version for createReadStream
    const gunzipStream = zlib.createGunzip()
    // Use tar.extract with cwd and strip=1 to extract contents directly into destinationDir
    // stripping the top-level directory typically found in node tarballs (e.g., node-vX.Y.Z-...)
    const extractStream = tar.extract({ cwd: destinationDir, strip: 1 })

    readStream.on('error', reject)
    gunzipStream.on('error', reject)
    extractStream.on('error', reject)

    // tar.extract emits 'close' when extraction is finished
    extractStream.on('close', () => {
      console.log('Extraction finished.')
      resolve()
    })

    readStream.pipe(gunzipStream).pipe(extractStream)
  })
}

/**
 * Extracts a .zip archive.
 * @param archivePath The full path to the .zip file.
 * @param destinationDir The directory to extract contents into.
 * @returns A Promise that resolves when extraction is complete.
 */
export async function extractZip(archivePath: string, destinationDir: string): Promise<void> {
  console.log(`Extracting ${archivePath} to ${destinationDir}...`)

  // Ensure the destination directory exists
  await mkdir(destinationDir, { recursive: true })

  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        return reject(err || new Error('Could not open zip file'))
      }

      zipfile.on('error', reject)

      zipfile.readEntry() // Start reading entries

      zipfile.on('entry', (entry) => {
        // Skip directories unless they end with a slash
        // Note: yauzl entries for directories typically end with '/'.
        if (/\/$/.test(entry.fileName)) {
          mkdir(join(destinationDir, entry.fileName), { recursive: true })
            .then(() => {
              zipfile.readEntry() // Read next entry
            })
            .catch(reject)
          return
        }

        // Strip the first path component (e.g., 'node-vX.Y.Z-...')
        // Find the index of the first '/' to split the path
        const firstSlashIndex = entry.fileName.indexOf('/')
        const strippedFileName =
          firstSlashIndex === -1
            ? entry.fileName // No slash, use as is (less common for node archives)
            : entry.fileName.substring(firstSlashIndex + 1) // Path after the first slash

        const entryPath = join(destinationDir, strippedFileName)

        // If it's a file, extract it
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err || !readStream) {
            return reject(
              err || new Error(`Could not open read stream for entry: ${entry.fileName}`)
            )
          }

          readStream.on('error', reject)

          // Ensure parent directory exists before writing
          mkdir(dirname(entryPath), { recursive: true })
            .then(() => {
              const writeStream = createWriteStream(entryPath) // Use sync version for createWriteStream
              writeStream.on('error', reject)
              writeStream.on('finish', () => {
                zipfile.readEntry() // Read next entry after file is written
              })
              readStream.pipe(writeStream)
            })
            .catch(reject)
        })
      })

      zipfile.on('end', () => {
        console.log('Extraction finished.')
        resolve()
      })
    })
  })
}

/**
 * Ensures a specific version of Node.js is downloaded and extracted to a user-specific directory.
 * Uses the provided downloadFile function and handles platform-specific archives (.zip, .tar.gz).
 *
 * @param version The desired Node.js version (e.g., '18.17.1').
 * @param downloadOptions Options passed to the downloadFile function (e.g., { onProgress }).
 * @param abortSignal An AbortSignal to cancel the download and extraction.
 * @returns A Promise that resolves with the absolute path to the Node.js executable.
 */
export const ensureNodeJS = async (
  downloadOptions?: Hooks,
  abortSignal?: AbortSignal
): Promise<string> => {
  const version = '22.14.0'
  const userData = app.getPath('userData')
  const baseDestinationDir = join(userData, 'thirdparty', 'node')
  // Create a version-specific directory for extraction
  const versionedDir = join(baseDestinationDir, `v${version}`)
  // Determine the expected path of the node executable *after* extraction
  // Standard Node.js archives structure, after stripping the top-level dir:
  // tar.gz (Linux/macOS): bin/node
  // zip (Windows): node.exe
  const nodeBinRelative = process.platform === 'win32' ? 'node.exe' : join('bin', 'node')
  const finalNodePath = join(versionedDir, nodeBinRelative)
  console.log(`Checking for Node.js ${version} executable at ${finalNodePath}...`)
  // 1. Check if the final executable already exists and is accessible
  try {
    // Use fs.access with fsSync.constants.X_OK to check for existence and execute permission
    await access(finalNodePath, constants.X_OK)
    console.log(`Node.js ${version} found at ${finalNodePath}. Using existing installation.`)
    return finalNodePath // Found it, return the path
  } catch (e: any) {
    if (e.code !== 'ENOENT' && e.code !== 'EACCES') {
      // Re-throw unexpected errors other than not found or permission denied
      throw new Error(`Error checking for existing Node.js installation: ${e.message}`)
    }
    // If ENOENT (not found) or EACCES (permission denied), proceed with download/extraction
    console.log(
      `Node.js ${version} not found or not executable at ${finalNodePath}. Proceeding with download/extraction.`
    )
  }
  // 2. If not found, determine download details
  const platform = process.platform === 'win32' ? 'win' : process.platform
  // Note: process.arch gives 'x64', 'ia32', 'arm', 'arm64'. These match Node.js distribution names.
  const arch = process.arch
  const fileExtension = platform === 'win' ? 'zip' : 'tar.gz'
  const fileName = `node-v${version}-${platform}-${arch}.${fileExtension}`
  const url = `https://nodejs.org/dist/v${version}/${fileName}`
  // The downloaded archive will live temporarily in the base directory
  const archivePath = join(baseDestinationDir, fileName)
  // 3. Ensure the base destination directory exists for the archive
  await mkdir(baseDestinationDir, { recursive: true })
  // 4. Download the archive using the provided downloadFile function
  console.log(`Attempting to download Node.js ${version} for ${platform}-${arch} from ${url}...`)
  try {
    // Assuming downloadFile is available and matches the signature
    await downloadFile(url, archivePath, downloadOptions, abortSignal)
    console.log('Node.js archive downloaded successfully.')
  } catch (error: any) {
    // Attempt to clean up the incomplete file if download failed
    try {
      await unlink(archivePath)
    } catch {} // Ignore cleanup errors
    throw new Error(`Failed to download Node.js archive from ${url}: ${error.message}`)
  }
  // Check if the operation was aborted after download
  if (abortSignal?.aborted) {
    console.log('Download aborted after completion.')
    // Attempt to clean up the downloaded archive
    try {
      await unlink(archivePath)
    } catch {} // Ignore cleanup errors
    throw new Error('Download aborted')
  }
  // 5. Ensure the versioned extraction directory exists (and is clean if needed)
  // It's safer to remove the directory first if it exists from a previous failed attempt
  try {
    await rm(versionedDir, { recursive: true, force: true })
    console.log(`Cleaned up potential previous extraction directory: ${versionedDir}`)
  } catch (e: any) {
    // Ignore errors if the directory didn't exist or couldn't be removed for benign reasons
    if (e.code !== 'ENOENT') {
      console.warn(`Failed to clean up ${versionedDir}: ${e.message}`)
    }
  }
  await mkdir(versionedDir, { recursive: true })
  // 6. Extract the archive
  try {
    if (fileExtension === 'zip') {
      await extractZip(archivePath, versionedDir)
    } else {
      // tar.gz
      await extractTarGz(archivePath, versionedDir)
    }
    console.log('Node.js archive extracted successfully.')
  } catch (error: any) {
    // Attempt to clean up the failed extraction directory and the downloaded archive
    try {
      await rm(versionedDir, { recursive: true, force: true })
    } catch {} // Ignore cleanup errors
    try {
      await unlink(archivePath)
    } catch {} // Ignore cleanup errors
    throw new Error(`Failed to extract Node.js archive ${archivePath}: ${error.message}`)
  }
  // Check if the operation was aborted after extraction
  if (abortSignal?.aborted) {
    console.log('Extraction aborted after completion.')
    // Attempt to clean up the extracted directory and the downloaded archive (archive might already be gone)
    try {
      await rm(versionedDir, { recursive: true, force: true })
    } catch {} // Ignore cleanup errors
    try {
      await unlink(archivePath)
    } catch {} // Ignore cleanup errors
    throw new Error('Extraction aborted')
  }
  // 7. Clean up the downloaded archive file
  try {
    await unlink(archivePath)
    console.log(`Removed downloaded archive: ${archivePath}`)
  } catch (e: any) {
    console.warn(`Failed to remove downloaded archive ${archivePath}: ${e.message}`)
    // Don't fail the whole function because cleanup failed
  }
  // 8. Set execute permissions on the executable for non-Windows platforms
  if (process.platform !== 'win32') {
    try {
      console.log(`Setting permissions on ${finalNodePath}`)
      await chmod(finalNodePath, 0o755) // rwxr-xr-x
      console.log('Permissions set successfully.')
    } catch (e: any) {
      console.warn(`Failed to set executable permissions on ${finalNodePath}: ${e.message}`)
      // This might cause issues later, but don't fail the *download/extract* process
    }
  }
  // 9. Final check: Verify the executable exists and is accessible after extraction
  try {
    await access(finalNodePath, constants.X_OK) // Check existence and executability
    console.log(`Node.js ${version} successfully installed and verified at ${finalNodePath}`)
    return finalNodePath // Success, return the path
  } catch (e: any) {
    // This should ideally not happen if extraction was reported as successful and chmod ran
    throw new Error(
      `Node.js executable not found or not executable after extraction at ${finalNodePath}. Extraction might have completed with errors or the directory structure is unexpected.`
    )
  }
}

export const zipFolder = async (from: string, to: string, log: typeof console.log) => {
  const archiver = await import('archiver')

  const { createWriteStream } = await import('node:fs')

  const output = createWriteStream(to)
  // const input = createReadStream(from);

  const archive = archiver.default('zip', {
    zlib: { level: 9 } // Sets the compression level.
  })

  // eslint-disable-next-line no-async-promise-executor
  return new Promise<string>(async (resolve, reject) => {
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function () {
      log(archive.pointer() + ' total bytes')
      log('archiver has been finalized and the output file descriptor has closed.')
      return resolve(to)
    })

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output.on('end', function () {
      log('Data has been drained')
    })

    const trottledLog = throttle((text: string) => {
      log(text)
    }, 500)

    archive.on('progress', (progress: any) => {
      trottledLog(`Progress: ${progress.entries.processed} / ${progress.entries.total} files`)
    })

    // archive.on("entry", (entry) => {
    //   log("entry", entry);
    // })

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function (err: Error) {
      log('warning', err)
    })

    // good practice to catch this error explicitly
    archive.on('error', function (err: Error) {
      reject(err)
    })

    archive.pipe(output)

    // // Find all files in the source directory
    // const files = await glob("**/*", {
    //   cwd: from,
    //   nodir: true,
    //   dot: true,
    // });

    // console.log('files', files)

    // // Add each file to the archive
    // for (const file of files) {
    //   const filePath = resolvePath(from, file);
    //   const relativePath = relative(from, filePath);
    //   archive.file(filePath, { name: relativePath });
    // }

    archive.directory(from, false)

    log('from', from)
    log('to', to)
    archive.finalize()
  })
}

// @ts-expect-error import.meta
const isCI = process.env.CI === 'true' || import.meta.env.CI === 'true'

export interface GraphExecutionOptions {
  /** The graph nodes to execute */
  graph: any[]
  /** Variables for the execution */
  variables: Variable[]
  /** Project information */
  projectName?: string
  projectPath?: string
  /** Main window for action execution */
  mainWindow?: BrowserWindow
  /** Logger function for node events */
  onNodeEnter?: (node: any) => void
  onNodeExit?: (node: any) => void
  /** Log handler function */
  onLog?: (data: any, node?: any) => void
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Optional output file path for CLI usage */
  outputPath?: string
}

/**
 * Unified function for executing processGraph with build history tracking
 * Used by both CLI (main.ts) and IPC handler (handlers.ts) implementations
 */
export const executeGraphWithHistory = async (options: GraphExecutionOptions) => {
  const { logger } = useLogger()
  const {
    graph,
    variables,
    projectName,
    projectPath,
    mainWindow,
    onNodeEnter,
    onNodeExit,
    onLog,
    abortSignal,
    outputPath
  } = options

  // Create build history entry for this pipeline execution
  const buildId = `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const buildEntry: BuildHistoryEntry = {
    id: buildId,
    projectId: projectPath || 'unknown',
    projectName: projectName || 'Unnamed Pipeline',
    projectPath: projectPath || 'unknown',
    status: 'running',
    startTime: Date.now(),
    steps: [],
    totalSteps: graph.length,
    completedSteps: 0,
    failedSteps: 0,
    cancelledSteps: 0,
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  // Save initial build history entry
  try {
    await buildHistoryStorage.save(buildEntry)
    logger().info(`Build history entry created: ${buildId}`)
  } catch (error) {
    logger().error('Failed to save initial build history entry:', error)
  }

  try {
    const pluginDefinitions = getFinalPlugins()

    const result = await processGraph({
      graph,
      definitions: pluginDefinitions,
      variables,
      steps: {},
      context: {},
      onNodeEnter: (node) => {
        logger().info('onNodeEnter', node.uid)
        onNodeEnter?.(node)
      },
      onNodeExit: (node) => {
        logger().info('onNodeExit', node.uid)
        onNodeExit?.(node)
      },
      onExecuteItem: (node, params) => {
        if (node.type === 'action') {
          return handleActionExecute(
            node.origin.nodeId,
            node.origin.pluginId,
            params,
            mainWindow,
            (data) => {
              if (!isCI) {
                logger().info('send', data)
              }
              onLog?.(data)
            },
            abortSignal || new AbortController().signal
          )
        } else {
          throw new Error('Unhandled type ' + node.type)
        }
      }
    })

    // Update build history entry as completed
    buildEntry.status = 'completed'
    buildEntry.endTime = Date.now()
    buildEntry.duration = buildEntry.endTime - buildEntry.startTime
    buildEntry.completedSteps = graph.length
    buildEntry.updatedAt = Date.now()

    await buildHistoryStorage.save(buildEntry)
    logger().info(`Build history entry updated as completed: ${buildId}`)

    // Handle output file for CLI usage
    if (outputPath) {
      const fs = await import('fs/promises')
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8')
    }

    return { result, buildId }
  } catch (e) {
    // Update build history entry as failed
    buildEntry.status = 'failed'
    buildEntry.endTime = Date.now()
    buildEntry.duration = buildEntry.endTime - buildEntry.startTime
    buildEntry.error = {
      message: e instanceof Error ? e.message : 'Unknown error',
      timestamp: Date.now()
    }
    buildEntry.updatedAt = Date.now()

    await buildHistoryStorage.save(buildEntry)
    logger().info(`Build history entry updated as failed: ${buildId}`)

    // Handle error output file for CLI usage
    if (outputPath) {
      const fs = await import('fs/promises')
      await fs.writeFile(
        outputPath,
        JSON.stringify({ error: (e as Error).message }, null, 2),
        'utf8'
      )
    }

    throw e
  }
}
