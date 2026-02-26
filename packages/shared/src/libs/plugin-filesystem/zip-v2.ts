import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'zip-v2-node'

export type MaybeArray<T> = T | T[]

export const getValue = <T>(array: MaybeArray<T>): T => {
  if (Array.isArray(array)) {
    return array[0]
  } else {
    return array
  }
}

export const zipV2 = createAction({
  id: ID,
  name: 'Zip',
  displayString: '`Zip ${fmt.param(params.folder, "primary", "No folder specified")}`',
  params: {
    folder: createPathParam('', {
      required: true,
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      },
      label: 'Folder'
    })
  },

  outputs: {
    path: {
      value: '',
      label: 'Path'
    }
  },
  description: 'Zip a folder into a .zip file',
  icon: '',
  meta: {}
})

export const zipV2Runner = createActionRunner<typeof zipV2>(
  async ({ log, inputs, setOutput, abortSignal, paths }) => {
    const { createWriteStream } = await import('node:fs')
    const { join } = await import('path')
    const { default: archiver } = await import('archiver')

    abortSignal.addEventListener('abort', () => {
      throw new Error('Aborted')
    })

    const outputDir = paths.cache
    const outputFile = join(outputDir, 'output.zip')

    console.log('outputFile', outputFile)

    const output = createWriteStream(outputFile)

    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    })

    return new Promise((resolve, reject) => {
      output.on('close', function () {
        console.log(archive.pointer() + ' total bytes')
        console.log('archiver has been finalized and the output file descriptor has closed.')

        setOutput('path', outputFile)
        resolve()
      })

      output.on('end', function () {
        console.log('Data has been drained')
      })

      archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
          console.log('Archiver warning: ENOENT')
        } else {
          reject(err)
        }
      })

      archive.on('error', function (err) {
        reject(err)
      })

      // archive.on('data', function (data) {
      //   log('data', data)
      // })
      // archive.on('progress', function (data) {
      //   /* {
      //     entries:
      //      {
      //        total: 5012,
      //        processed: 5012
      //      },
      //     fs:
      //      {
      //        totalBytes: 318794388,
      //        processedBytes: 318794388
      //      }
      //   } */
      //   // log('progress', data.entries.processed + '/' + data.entries.total)
      // })
      archive.on('entry', function (data) {
        log('Adding', data.name)
      })
      archive.on('finish', function () {
        log('finish')
      })

      archive.pipe(output)

      archive.directory(inputs.folder, false)

      archive.finalize()
    })
  }
)
