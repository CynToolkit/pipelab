import { Action, ActionRunner, ActionRunnerData, InputsDefinition, ParamsToInput, runWithLiveLogs } from "@cyn/plugin-core";
import { script } from "./assets/script.js";

export const sharedParams = {
  username: {
    label: "Username",
    value: "",
    required: false,
    control: {
      type: "input",
      options: {
        kind: "text",
      },
    },
  },
  password: {
    control: {
      type: "input",
      options: {
        kind: "text",
      },
    },
    required: false,
    value: "",
    label: "Password",
  },
  version: {
    label: "Version",
    required: false,
    control: {
      type: "input",
      options: {
        kind: "text",
      },
    },
    value: undefined as string | undefined,
  },
  headless: {
    required: false,
    control: {
      type: "boolean",
    },
    value: false,
    label: "Start headless",
  },
} satisfies InputsDefinition;

type Inputs = ParamsToInput<typeof sharedParams>

export const exportc3p = async <ACTION extends Action>(file: string, { cwd, log, inputs, setOutput, paths }: ActionRunnerData<ACTION>) => {
    const newInputs = inputs as Inputs

    const playwright = await import("playwright");
    const { join } = await import("node:path");

    const { unpack } = paths
    const modulesPath = join(unpack, 'node_modules')

    console.log('modulesPath', modulesPath)

    const execPath = process.execPath

    console.log('execPath', execPath)

    // const playwrightServer = await import("playwright-core/lib/server");

    const browserName: "chromium" | "firefox" | "webkit" = "chromium";

    // const a = await playwrightServer.installBrowsersForNpmInstall([
    //   browserName,
    // ]);
    await runWithLiveLogs(
      execPath,
      [ join(modulesPath, 'playwright', 'cli.js'), 'install', browserName ],
      {
        env: {
          ELECTRON_RUN_AS_NODE: '1',
        },
      },
      log,
    )

    const downloadDir = join(cwd, "playwright");

    log("downloadDir", downloadDir);

    log("exporting construct project");

    log("newInputs", newInputs);

    // must run in firefox because otherwise
    // the local file system access api of chrome take precedence
    // https://github.com/microsoft/playwright/issues/18267
    const browserInstance = playwright[browserName];
    // const { firefox } = playwright;

    const version = newInputs.version;
    const headless = newInputs.headless;

    const browser = await browserInstance.launch({
      headless: headless,
    });

    const context = await browser.newContext({
      locale: 'en-US',
    });
    await context.clearPermissions();

    const page = await context.newPage();

    // this exact sequn=ence make it work
    await page.addInitScript(() => {
      // @ts-expect-error
      delete self.showOpenFilePicker
    });
    page.on("filechooser", (worker) => {
      console.log("filechooser created: " + worker.page.name);
    });
    // ---------------------------------

    const result = await script(page, log, file, newInputs.username, newInputs.password, version, downloadDir);

    await browser.close();

    log("setting output result to ", result);

    setOutput("folder", result);
}
