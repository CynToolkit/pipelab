import { createAction, createActionRunner, runWithLiveLogs } from '@pipelab/plugin-core'
import { checkSteamAuth, openExternalTerminal } from './utils'

// https://github.com/ztgasdf/steampkg?tab=readme-ov-file#account-management

// How to login
// Do it at least once
// sdk/tools/ContentBuilder/builder_linux/steamcmd.sh +login User +quit

export const ID = 'steam-upload'

export const uploadToSteam = createAction({
  id: ID,
  name: 'Upload to Steam',
  description: 'Upload a folder to Steam',
  icon: '',
  displayString: "`Upload ${fmt.param(params['folder'], 'primary')} to steam`",
  meta: {},
  params: {
    sdk: {
      value: '',
      label: 'Steam Sdk path',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    },
    username: {
      value: '',
      label: 'Steam username',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    appId: {
      value: '',
      label: 'App Id',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    depotId: {
      value: '',
      label: 'Depot Id',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    description: {
      label: 'Description',
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    folder: {
      value: '',
      label: 'Folder to upload',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    }
  },
  outputs: {}
})

export const uploadToSteamRunner = createActionRunner<typeof uploadToSteam>(
  async ({ log, inputs, cwd, abortSignal }) => {
    const { join, dirname } = await import('path')
    const { platform } = await import('os')
    const { chmod, mkdir, writeFile } = await import('fs/promises')

    const { folder, appId, sdk, depotId, username, description } = inputs
    log(`uploading "${folder}" to steam`)

    const buildOutput = join(cwd, 'steam', 'output')
    const scriptPath = join(cwd, 'steam', 'script.vdf')

    await mkdir(buildOutput, {
      recursive: true
    })

    await mkdir(dirname(scriptPath), {
      recursive: true
    })

    const script = `"AppBuild"
{
	"AppID" "${appId}" // your AppID
	"Desc" "${description}" // internal description for this build

	"ContentRoot" "${folder}" // root content folder, relative to location of this file
	"BuildOutput" "${buildOutput}" // build output folder for build logs and build cache files

	"Depots"
	{
		"${depotId}" // your DepotID
		{
			"FileMapping"
			{
				"LocalPath" "*" // all files from contentroot folder
				"DepotPath" "." // mapped into the root of the depot
				"recursive" "1" // include all subfolders
			}
		}
	}
}`

    console.log('script', script)

    let builderFolder = 'builder'
    if (platform() === 'linux') {
      builderFolder += '_linux'
    } else if (platform() === 'darwin') {
      builderFolder += '_osx'
    }

    const cmd = 'steamcmd'
    let cmdFinal = 'steamcmd'
    if (platform() === 'linux') {
      cmdFinal += '.sh'
    } else if (platform() === 'darwin') {
      cmdFinal += '.sh'
    } else if (platform() === 'win32') {
      cmdFinal += '.exe'
    }

    const steamcmdPath = join(sdk, 'tools', 'ContentBuilder', builderFolder, cmdFinal)

    console.log('steamcmdPath', steamcmdPath)

    if (platform() === 'linux' || platform() === 'darwin') {
      if (platform() === 'linux') {
        log('Adding "execute" permissions to linux binary')
        const steamcmdBinaryPath = join(
          sdk,
          'tools',
          'ContentBuilder',
          builderFolder,
          'linux32',
          cmd
        )
        await chmod(steamcmdBinaryPath, 0o755)
        const steamcmdBinaryErrorReporterPath = join(
          sdk,
          'tools',
          'ContentBuilder',
          builderFolder,
          'linux32',
          'steamerrorreporter'
        )
        await chmod(steamcmdBinaryErrorReporterPath, 0o755)
      }

      if (platform() === 'darwin') {
        const steamcmdBinaryPath = join(sdk, 'tools', 'ContentBuilder', builderFolder, cmd)
        log('Adding "execute" permissions to darwin binary')
        await chmod(steamcmdBinaryPath, 0o755)
      }

      log('Adding "execute" permissions to binary')
      await chmod(steamcmdPath, 0o755)
    }

    // check for steam authentication
    const isAuthenticated = await checkSteamAuth({
      context: {
        log,
        abortSignal,
      },
      scriptPath,
      steamcmdPath,
      username
    })

    log('isAuthenticated', JSON.stringify(isAuthenticated))

    if (isAuthenticated.success === false) {
      log('Opening terminal with interactive login')
      await openExternalTerminal(steamcmdPath, ['+login', username, '+quit'], {
        cancelSignal: abortSignal,
      })
      const isAuthenticatedNow = await checkSteamAuth({
        context: {
          log,
          abortSignal,
        },
        scriptPath,
        steamcmdPath,
        username
      })
      if (isAuthenticatedNow.success === false) {
        throw new Error('Not authenticated')
      }
    }

    log('Writing script')
    await writeFile(scriptPath, script, {
      encoding: 'utf8',
      signal: abortSignal
    })

    log('Executing steamcmd')

    // SHould be authed here
    try {
      await runWithLiveLogs(
        steamcmdPath,
        ['+login', username, '+run_app_build', scriptPath, '+quit'],
        {
          cancelSignal: abortSignal,
        },
        log
      )
    } catch (e) {
      if (e instanceof Error) {
        console.error(e)
        throw new Error('Error:' + e.message)
      } else {
        throw new Error('unknwon error')
      }
    }

    log('Done uploading')
  }
)
