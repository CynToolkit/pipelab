import {
  createAction,
  createActionRunner,
  downloadFile,
  runWithLiveLogs
} from '@pipelab/plugin-core'

export const ID = 'nvpatch'

export const NVPatch = createAction({
  id: ID,
  name: 'Patch binary',
  description: '',
  icon: '',
  displayString: "`Patch binary ${fmt.param(params['input'], 'primary')}`",
  meta: {},
  params: {
    input: {
      label: 'File to patch',
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openFile']
        }
      }
    }
  },
  outputs: {}
})

export const NVPatchRunner = createActionRunner<typeof NVPatch>(
  async ({ log, inputs, paths, abortSignal, cwd }) => {
    const { join, resolve } = await import('node:path')
    const { writeFile, cp, mkdir } = await import('node:fs/promises')
    const { shell } = await import('electron')
    const StreamZip = await import('node-stream-zip')

    // const peBinFolder = join(cwd, 'EditBinPE')
    // const peBinZip = peBinFolder + '.zip'
    // const peBinBin = join(peBinFolder, 'EditBinPE.exe')

    // log('Downloading EditBinPE to', peBinFolder)

    // // donwload the zip file
    // await downloadFile(
    //   'https://github.com/GabrielFrigo4/EditBinPE/releases/download/Release-1.0.1/EditBinPE.zip',
    //   peBinZip,
    //   {},
    //   abortSignal
    // )

    // log('Unzipping', peBinZip, 'to', peBinFolder)
    // await mkdir(peBinFolder, { recursive: true })
    // // unzip the file
    // const zip = new StreamZip.default.async({ file: peBinZip })
    // const bytes = await zip.extract(null, peBinFolder)
    // console.log('bytes', bytes)
    // await zip.close()

    // run

    console.log('process.env', process.env)

    const nvpatch = resolve(join(process.env.USERPROFILE, '.dotnet', 'tools', 'nvpatch.exe'))

    console.log('nvpatch', nvpatch)

    await runWithLiveLogs(
      nvpatch,
      ['--enable', inputs['input']],
      {
        cancelSignal: abortSignal,
      },
      log
    )
  }
)
