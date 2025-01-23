import { createAction, createActionRunner } from '@pipelab/plugin-core'

export const ID = 'unzip-file-node'

export const unzip = createAction({
  id: ID,
  name: 'Unzip file',
  displayString: '`Unzip ${fmt.param(params.file, "primary")}`',
  params: {
    file: {
      control: {
        type: 'path',
        options: {
          properties: ['openFile']
        }
      },
      value: '',
      label: 'File'
    }
  },

  outputs: {
    output: {
      value: '',
      label: 'Output'
    }
  },
  description: 'Unzip a file to a specified folder',
  icon: '',
  meta: {}
})

export const unzipRunner = createActionRunner<typeof unzip>(
  async ({ log, inputs, setOutput, cwd }) => {
    const StreamZip = await import('node-stream-zip')
    const { join } = await import('node:path')

    console.log('inputs', inputs)

    console.log('inputs.file', inputs.file)
    const file = inputs.file
    console.log('file', file)
    const output = join(cwd)

    console.log('file', file)
    console.log('output', output)

    log('Unzip file', inputs.file, 'to', output)

    const zip = new StreamZip.default.async({ file })

    const bytes = await zip.extract(null, output)
    await zip.close()

    console.log('bytes', bytes)

    setOutput('output', output)
  }
)
