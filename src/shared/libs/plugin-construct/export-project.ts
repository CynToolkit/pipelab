import { ExtractInputsFromAction, createAction, createActionRunner } from '@cyn/plugin-core'
import { exportc3p, sharedParams } from './export-shared.js'

export const ID = 'export-construct-project-folder'

export const exportProjectAction = createAction({
  id: ID,
  name: 'Export folder',
  displayString: "`Export projet ${params.version ? `r${params.version}` : ''}`",
  meta: {},
  params: {
    folder: {
      label: 'Folder',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    },
    ...sharedParams
  },
  outputs: {
    folder: {
      type: 'path',
      value: undefined as undefined | string,
      label: 'Exported zip'
      // schema: schema.string()
    }
  },
  description: 'Export construct project from folder',
  icon: ''
})

const zipFolder = async (from: string, to: string, log: typeof console.log) => {
  const archiver = await import('archiver')

  const { createWriteStream, createReadStream } = await import('node:fs')

  const output = createWriteStream(to)
  // const input = createReadStream(from);

  const archive = archiver.default('zip', {
    zlib: { level: 9 } // Sets the compression level.
  })

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

    archive.on('progress', (progress: any) => {
      log(`Progress: ${progress.entries.processed} / ${progress.entries.total} files`)
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

export const ExportProjectActionRunner = createActionRunner<typeof exportProjectAction>(
  async (options) => {
    const { join } = await import('node:path')

    const outputPath = join(options.cwd, 'c3_tmp_proj.c3p')

    const to = await zipFolder(options.inputs.folder, outputPath, options.log)

    await exportc3p(to, options)
  }
)

export type Params = ExtractInputsFromAction<typeof exportProjectAction>
