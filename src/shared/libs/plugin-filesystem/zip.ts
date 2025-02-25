import { createAction, createActionRunner, createPathParam } from '@pipelab/plugin-core'

export const ID = 'zip-node'

export type MaybeArray<T> = T | T[]

export const getValue = <T>(array: MaybeArray<T>): T => {
  if (Array.isArray(array)) {
    return array[0]
  } else {
    return array
  }
}

export const zip = createAction({
  id: ID,
  name: 'Zip',
  displayString:
    '`Zip ${fmt.param(params.folder, "primary", "No folder specified")} to ${fmt.param(params.output, "secondary", "No output specified")}`',
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
    }),
    output: createPathParam('', {
      required: true,
      control: {
        type: 'path',
        options: {
          properties: ['openFile', 'promptToCreate'],
          // must be zip file
          filters: [
            {
              extensions: ['zip'],
              name: 'Zip file'
            }
          ]
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

export const zipRunner = createActionRunner<typeof zip>(
  async ({ log, inputs, setOutput, abortSignal }) => {
    const { createWriteStream } = await import('node:fs')
    const { default: archiver } = await import('archiver')

    abortSignal.addEventListener('abort', () => {
      throw new Error('Aborted')
    })

    const output = createWriteStream(inputs.output)

    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    })

    return new Promise((resolve, reject) => {
      output.on('close', function () {
        console.log(archive.pointer() + ' total bytes')
        console.log('archiver has been finalized and the output file descriptor has closed.')

        setOutput('path', inputs.output)
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
