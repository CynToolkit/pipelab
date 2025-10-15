import {
  createAction,
  createActionRunner,
  createPathParam,
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
    input: createPathParam('', {
      required: true,
      label: 'File to patch',
      control: {
        type: 'path',
        options: {
          properties: ['openFile']
        }
      }
    })
  },
  outputs: {}
})

export const NVPatchRunner = createActionRunner<typeof NVPatch>(
  async ({ log, inputs, paths, abortSignal, cwd }) => {
    const { join, resolve } = await import('node:path')

    // run

    console.log('process.env', process.env)

    // Detect platform and set up platform-specific configuration
    const isMacOS = process.platform === 'darwin'
    const isWindows = process.platform === 'win32'

    let nvpatchCommand: string
    let nvpatchArgs: string[]

    if (isMacOS) {
      // macOS: Use arch -x86_64 with dotnet runtime and DLL path
      const dotnetRuntime = '/usr/local/share/dotnet/x64/dotnet'
      const nvpatchDll = resolve(join(process.env.HOME!, '.dotnet', 'tools', 'nvpatch.dll'))

      log('Trying nvpatch from', nvpatchDll)

      nvpatchCommand = 'arch'
      nvpatchArgs = ['-x86_64', dotnetRuntime, nvpatchDll, '--enable', inputs['input']]
    } else {
      // Windows: Use direct executable path with HOME instead of USERPROFILE
      const nvpatchExe = resolve(join(process.env.USERPROFILE!, '.dotnet', 'tools', 'nvpatch.exe'))

      log('Trying nvpatch from', nvpatchExe)

      nvpatchCommand = nvpatchExe
      nvpatchArgs = ['--enable', inputs['input']]
    }

    await runWithLiveLogs(
      nvpatchCommand,
      nvpatchArgs,
      {
        cancelSignal: abortSignal
      },
      log
    )
    log('nvpatch done')
  }
)
