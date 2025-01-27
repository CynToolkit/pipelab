import {
  Action,
  ActionRunnerData,
  InputsDefinition,
  ParamsToInput,
  runWithLiveLogs
} from '@pipelab/plugin-core'
import { script } from './assets/script.js'
import v from 'valibot'
import { BrowserContext } from 'playwright'

// @ts-expect-error import.meta
const isCI = process.env.CI === 'true' || import.meta.env.CI === 'true'

export const sharedParams = {
  username: {
    label: 'Username',
    value: '',
    required: false,
    description: 'Your Construct username',
    control: {
      type: 'input',
      options: {
        kind: 'text'
      }
    }
  },
  password: {
    description:
      'Your Construct password. Will only be used locally to automate the export on Construct website via a local browser. Will not be sent to any server.',
    control: {
      type: 'input',
      options: {
        kind: 'text'
      }
    },
    required: false,
    value: '',
    label: 'Password'
  },
  version: {
    description: 'The Construct version you want to use',
    label: 'Version',
    required: false,
    control: {
      type: 'input',
      options: {
        kind: 'text',
        validator: 'construct-version'
      }
    },
    value: undefined as string | undefined
  },
  headless: {
    description: 'Whether to show the browser while export',
    required: false,
    control: {
      type: 'boolean'
    },
    value: false,
    label: 'Start headless'
  },
  timeout: {
    description: "The timeout (in seconds) to close the browser if it's stuck",
    required: false,
    control: {
      type: 'input',
      options: {
        kind: 'number'
      }
    },
    value: 120,
    label: 'Timeout'
  }
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
  console.log('event listening')
  const newInputs = inputs as Inputs

  // const { addonsFolder } = newInputs

  const playwright = await import('playwright')
  const { join } = await import('node:path')

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
      cancelSignal: abortSignal,
    },
    log,
    {
      onStdout(data) {
        log(data)
      },
      onStderr(data) {
        log(data)
      }
    },
  )

  const downloadDir = join(cwd, 'playwright')

  log('Browser downloaded to', downloadDir)

  log('Exporting construct project')

  console.log('newInputs', newInputs)

  const browserInstance = playwright[browserName]

  const version = newInputs.version
  const headless = newInputs.headless

  const browser = await browserInstance.launch({
    headless: headless
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

    setOutput('folder', result)
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
