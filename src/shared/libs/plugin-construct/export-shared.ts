import {
  Action,
  ActionRunnerData,
  createNumberParam,
  createPasswordParam,
  createPathParam,
  createStringParam,
  InputsDefinition,
  ParamsToInput,
  runWithLiveLogs
} from '@pipelab/plugin-core'
import { script } from './assets/script.js'
import v from 'valibot'
import { BrowserContext } from 'playwright'
import { join } from 'node:path'

const platform = process.platform
const { LOCALAPPDATA, XDG_CONFIG_HOME } = process.env

// @ts-expect-error import.meta
const isCI = process.env.CI === 'true' || import.meta.env.CI === 'true'

let baseProfile
if (platform === 'win32') {
  baseProfile = join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
} else if (platform === 'linux' || platform === 'darwin') {
  baseProfile = join(XDG_CONFIG_HOME, 'google-chrome')
}

export const sharedParams = {
  username: createStringParam('', {
    label: 'Username',
    required: false,
    description: 'Your Construct username',
  }),
  password: createPasswordParam('', {
    description:
      'Your Construct password. Will only be used locally to automate the export on Construct website via a local browser. Will not be sent to any server.',
    required: false,
    label: 'Password',
  }),
  version: createStringParam('', {
    description: 'The Construct version you want to use',
    label: 'Version',
    required: false,
  }),
  headless: {
    description: 'Whether to show the browser while export',
    required: false,
    control: {
      type: 'boolean'
    },
    value: false,
    label: 'Start headless'
  },
  timeout: createNumberParam(120, {
    description: "The timeout (in seconds) to close the browser if it's stuck",
    required: false,
    label: 'Timeout'
  }),
  // customBrowser: {
  //   description: 'Start your own browser rather than the predefined one',
  //   control: {
  //     type: 'path',
  //     options: {
  //       properties: ['openFile']
  //     }
  //   },
  //   label: 'Custom browser',
  //   value: ''
  // },
  customProfile: createPathParam(undefined, {
    required: false,
    description: 'Use your own profile (X:\\Users\\XXX\\AppData\\Local\\Google\\Chrome\\User Data)',
    control: {
      type: 'path',
      options: {
        properties: ['openDirectory'],
        defaultPath: baseProfile
      }
    },
    label: 'Custom profile'
  })
  // addonsFolder: {
  //   description: 'Folder containing addons to import in the editor',
  //   required: false,
  //   control: {
  //     type: 'path',
  //     options: {
  //       buttonLabel: 'Addons folder',
  //       properties: ['openDirectory']
  //     }
  //   },
  //   value: '',
  //   label: 'Addons folder'
  // }
} satisfies InputsDefinition

type Inputs = ParamsToInput<typeof sharedParams>

export const exportc3p = async <ACTION extends Action>(
  file: string,
  { cwd, log, inputs, setOutput, paths, abortSignal }: ActionRunnerData<ACTION>
) => {
  let context: BrowserContext | undefined = undefined

  abortSignal.addEventListener('abort', () => {
    console.error('aborted')

    context?.close()
  })
  const newInputs = inputs as Inputs

  // const { addonsFolder } = newInputs

  const playwright = await import('playwright')
  const { join, dirname } = await import('node:path')
  const { cp, mkdir } = await import('node:fs/promises')

  const { unpack } = paths
  const modulesPath = join(unpack, 'node_modules')

  const execPath = process.execPath

  // const playwrightServer = await import("playwright-core/lib/server");

  const browserName: 'chromium' | 'firefox' | 'webkit' = 'chromium'

  // const a = await playwrightServer.installBrowsersForNpmInstall([
  //   browserName,
  // ]);
  log('Downloading browser')
  await runWithLiveLogs(
    execPath,
    [join(modulesPath, 'playwright', 'cli.js'), 'install', browserName],
    {
      env: {
        ELECTRON_RUN_AS_NODE: '1'
      },
      cancelSignal: abortSignal
    },
    log,
    {
      onStdout(data) {
        log(data)
      },
      onStderr(data) {
        log(data)
      }
    }
  )

  const downloadDir = join(cwd, 'playwright')

  log('Browser downloaded to', downloadDir)

  log('Exporting construct project')

  console.log('newInputs', newInputs)

  const browserInstance = playwright[browserName]

  const version = newInputs.version
  const headless = newInputs.headless

  // if (newInputs.customBrowser && !newInputs.customProfile) {
  //   throw new Error('You must specify a custom profile when using a custom browser')
  // }

  // if (!newInputs.customBrowser && newInputs.customProfile) {
  //   throw new Error('You must specify a custom browser when using a custom profile')
  // }

  // if (newInputs.customBrowser && newInputs.customProfile) {
  if (newInputs.customProfile) {
    const customProfile = join(cwd, 'playwright-profile')

    await mkdir(customProfile, {
      recursive: true
    })

    const indexedDbPathSource = join(newInputs.customProfile, 'Default', 'IndexedDB')
    const indexedDbPathDestination = join(customProfile, 'Default', 'IndexedDB')
    const pathsToCopy = [
      'https_editor.construct.net_0.indexeddb.blob',
      'https_editor.construct.net_0.indexeddb.leveldb'
    ]

    for (const p of pathsToCopy) {
      const from = join(indexedDbPathSource, p)
      const to = join(indexedDbPathDestination, p)
      await cp(from, to, {
        recursive: true
      })
    }

    context = await browserInstance.launchPersistentContext(customProfile, {
      headless,
      locale: 'en-US',
      recordVideo: isCI
        ? {
            dir: join(process.cwd(), 'playwright')
          }
        : undefined
    })
  } else {
    const browser = await browserInstance.launch({
      headless
    })

    context = await browser.newContext({
      locale: 'en-US',
      recordVideo: isCI
        ? {
            dir: join(process.cwd(), 'playwright')
          }
        : undefined
    })
    await context.clearPermissions()
  }

  const page = await context.newPage()

  page.setDefaultTimeout(newInputs.timeout * 1000)

  // this exact sequn=ence make it work
  await page.addInitScript(() => {
    // @ts-expect-error dds
    delete self.showOpenFilePicker
  })
  page.on('filechooser', (worker) => {
    console.log('filechooser created: ' + worker.page.name)
  })
  // ---------------------------------

  try {
    const result = await script(
      page,
      log,
      file,
      newInputs.username,
      newInputs.password,
      version,
      downloadDir
      // addonsFolder,
    )

    log('Setting output result to ', result)

    setOutput('folder', result) // deprecated

    setOutput('parentFolder', dirname(result))
    setOutput('zipFile', result)
  } catch (e) {
    log('error, no result, crashed', e)
    throw new Error('ConstructExport failed: ' + e.message)
  } finally {
    // await context.browser().close()
    await context.close()
  }
}

export const constructVersionValidator = (options: any) => {
  void options
  return v.pipe(v.string(), v.regex(/^\d+(-\d+)?$/, 'Invalid version'))
}
