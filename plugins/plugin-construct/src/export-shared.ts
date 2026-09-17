import {
  Action,
  ActionRunnerData,
  createNumberParam,
  createPasswordParam,
  createPathParam,
  createStringParam,
  InputsDefinition,
  ParamsToInput,
  runWithLiveLogs,
  fetchPackage,
} from "@pipelab/plugin-core";
import { script } from "./assets/script.js";
import * as v from "valibot";
import { BrowserContext } from "playwright";
import { dirname, join, delimiter, basename } from "node:path";
import { cp, mkdir, readdir, stat, copyFile, chmod, rm, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { createRequire } from "node:module";
import {
  formatRendererCrash,
  readLinuxMemorySnapshot,
  shouldRecordPlaywrightVideo,
} from "./runtime-diagnostics.js";

const platform = process.platform;
const { LOCALAPPDATA, XDG_CONFIG_HOME } = process.env;

const isCI = process.env.CI === "true";

let baseProfile;
if (platform === "win32") {
  baseProfile = join(LOCALAPPDATA ?? "", "Google", "Chrome", "User Data");
} else if (platform === "linux") {
  const configHome =
    XDG_CONFIG_HOME && XDG_CONFIG_HOME.trim() !== "" ? XDG_CONFIG_HOME : join(homedir(), ".config");
  baseProfile = join(configHome, "google-chrome");
} else if (platform === "darwin") {
  baseProfile = join(homedir(), "Library", "Application Support", "Google", "Chrome");
}

export const sharedParams = {
  username: createStringParam("", {
    label: "Username",
    required: false,
    description: "Your Construct username",
  }),
  password: createPasswordParam("", {
    description:
      "Your Construct password. Will only be used locally to automate the export on Construct website via a local browser. Will not be sent to any server.",
    required: false,
    label: "Password",
  }),
  version: createStringParam("", {
    description: "The Construct version you want to use",
    label: "Version",
    required: false,
  }),
  headless: {
    description: "Whether to show the browser while export",
    required: false,
    control: {
      type: "boolean",
    },
    value: false,
    label: "Start headless",
  },
  timeout: createNumberParam(120, {
    description: "The timeout (in seconds) to close the browser if it's stuck",
    required: false,
    label: "Timeout",
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
    description:
      "Use your own profile (X:\\Users\\XXX\\AppData\\Local\\Google\\Chrome\\User Data). Useful if you want to reuse plugins installed in your current browser",
    control: {
      type: "path",
      options: {
        properties: ["openDirectory"],
        defaultPath: baseProfile,
      },
    },
    label: "Custom profile",
  }),
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
} satisfies InputsDefinition;

type Inputs = ParamsToInput<typeof sharedParams>;

const transientProfileEntries = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "GrShaderCache",
  "ShaderCache",
  "Service Worker",
  "Sessions",
  "Current Session",
  "Current Tabs",
  "Last Session",
  "Last Tabs",
]);

async function resilientCopy(src: string, dest: string, log: any) {
  try {
    const s = await stat(src);
    if (s.isDirectory()) {
      await mkdir(dest, { recursive: true });
      const entries = await readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        if (transientProfileEntries.has(entry.name)) {
          log(`  Skipping transient Chromium profile data: ${entry.name}`);
          continue;
        }
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        await resilientCopy(srcPath, destPath, log);
      }
    } else {
      try {
        await copyFile(src, dest);
        try {
          // Remove read-only attribute on the copied file so Playwright can use it
          await chmod(dest, 0o666);
        } catch (e) {
          // ignore chmod errors
        }
      } catch (err) {
        log(`    [WARNING] Failed to copy file ${src}: ${err}`);
      }
    }
  } catch (err) {
    log(`  [WARNING] Failed to access ${src}: ${err}`);
  }
}

const profileLockNames = new Set(["LOCK", "SingletonCookie", "SingletonLock", "SingletonSocket"]);

const removeProfileLocks = async (root: string): Promise<void> => {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await removeProfileLocks(path).catch(() => {});
    } else if (profileLockNames.has(entry.name)) {
      await rm(path, { force: true }).catch(() => {});
    }
  }
};

/**
 * Copies a browser profile into a fresh Playwright user-data directory.
 *
 * Construct stores addon metadata alongside the IndexedDB LevelDB files. Copying
 * only the individual LevelDB folders loses that metadata, so Chromium opens an
 * empty `c3-addon-files` database and reports the addon as missing.
 */
export const preparePlaywrightProfile = async (
  source: string,
  destination: string,
  log: (...args: any[]) => void = () => {},
) => {
  const playwrightProfile = join(destination, "Default");
  await resilientCopy(source, playwrightProfile, log);
  await removeProfileLocks(playwrightProfile);
};

export const exportc3p = async <ACTION extends Action>(
  file: string,
  { cwd, log, inputs, setOutput, paths, abortSignal, context: ctx }: ActionRunnerData<ACTION>,
) => {
  let browserContext: BrowserContext | undefined = undefined;
  let browser: any | undefined = undefined;
  let customProfile: string | undefined = undefined;

  const cleanup = async () => {
    await browserContext?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (customProfile) {
      await rm(customProfile, { recursive: true, force: true }).catch(() => {});
    }
  };

  const onAbort = () => {
    console.error("aborted");
    cleanup();
  };
  const newInputs = inputs as Inputs;

  abortSignal.addEventListener("abort", onAbort);

  // const { addonsFolder } = newInputs

  const { thirdparty, node, pnpm } = paths;

  const browserName: "chromium" | "firefox" | "webkit" = "chromium";

  const { packageDir: playwrightPkgPath } = await fetchPackage("playwright-core", "1.62.1", {
    installDeps: true,
    context: ctx,
  });
  const playwrightCli = join(playwrightPkgPath, "cli.js");
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH || join(thirdparty, "playwright-browsers");

  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const chromeBinary = join(browsersPath, "chromium-1234", "chrome-linux", "chrome");
  if (existsSync(chromeBinary)) {
    log("Browser already exists at", browsersPath, "- skipping download");
  } else {
    log("Downloading browser to", browsersPath);
    await runWithLiveLogs(
      node,
      [playwrightCli, "install", browserName],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browsersPath,
          PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
        },
        cancelSignal: abortSignal,
      },
      log,
      {
        onStdout(data) {
          log(data);
        },
        onStderr(data) {
          log(data);
        },
      },
    );
  }

  // Electron's Vite main-process bundle is CommonJS, where import.meta.url is
  // undefined. Use an absolute anchor that works in both ESM and CommonJS.
  const require = createRequire(join(process.cwd(), "package.json"));
  const playwrightModule = require(join(playwrightPkgPath, "index.js"));
  const playwright = playwrightModule.default || playwrightModule;

  const downloadDir = join(cwd, "playwright");
  await mkdir(downloadDir, { recursive: true });

  log("Browser downloaded to", downloadDir);

  log("Exporting construct project");

  console.log("newInputs", newInputs);

  const browserInstance = playwright[browserName];

  let version = newInputs.version;
  // if version is full digit, prepend "r", otherwise, use as is
  if (version && /^\d+$/.test(version as string)) {
    version = `r${version}`;
  }
  const headless = newInputs.headless;
  const recordVideo = shouldRecordPlaywrightVideo(process.env.NODE_ENV, isCI)
    ? { dir: downloadDir }
    : undefined;

  // if (newInputs.customBrowser && !newInputs.customProfile) {
  //   throw new Error('You must specify a custom profile when using a custom browser')
  // }

  // if (!newInputs.customBrowser && newInputs.customProfile) {
  //   throw new Error('You must specify a custom browser when using a custom profile')
  // }

  // if (newInputs.customBrowser && newInputs.customProfile) {
  // Use a fresh temp directory every run so there is no stale LevelDB data
  // from a previous Playwright session that could corrupt the copied profile.
  customProfile = await mkdtemp(join(tmpdir(), "pipelab-playwright-"));

  if (newInputs.customProfile) {
    log("Setting up Playwright profile from custom Chrome profile...");
    log(`  - Target playwright-profile folder: ${customProfile}`);

    const indexedDbPathSource = join(newInputs.customProfile, "IndexedDB");
    log(`  - Source IndexedDB folder: ${indexedDbPathSource}`);
    if (!existsSync(indexedDbPathSource)) {
      log(
        `  [WARNING] Source IndexedDB directory does not exist: "${indexedDbPathSource}". Verify your custom profile path.`,
      );
    }
    await preparePlaywrightProfile(newInputs.customProfile, customProfile, log);

    browserContext = await browserInstance.launchPersistentContext(customProfile, {
      headless: headless as boolean,
      locale: "en-US",
      recordVideo,
    });
  } else {
    browser = await browserInstance.launch({
      headless: headless as boolean,
    });

    browserContext = await browser.newContext({
      locale: "en-US",
      recordVideo,
    });
    await browserContext?.clearPermissions();
  }

  if (!browserContext) {
    throw new Error("Failed to initialize browser context");
  }

  const page = await browserContext.newPage();
  const video = page.video();
  let pageCrashed = false;
  page.on("crash", () => {
    pageCrashed = true;
    log("Construct renderer crashed");
  });

  page.setDefaultTimeout((newInputs.timeout as number) * 1000);

  // this exact sequn=ence make it work
  await page.addInitScript(() => {
    // @ts-expect-error dds
    delete self.showOpenFilePicker;
  });
  page.on("filechooser", (worker) => {
    console.log("filechooser created: " + worker.page.name);
  });
  // ---------------------------------

  try {
    const result = await script(
      page,
      log,
      file,
      newInputs.username as string,
      newInputs.password as string,
      version as string,
      downloadDir,
      abortSignal,
      // addonsFolder,
    );

    log("Setting output result to ", result);

    setOutput("folder", result); // deprecated

    setOutput("parentFolder", dirname(result));
    setOutput("zipFile", result);
  } catch (e: any) {
    log("error, no result, crashed", e);
    if (pageCrashed || /(?:page|target) crashed/i.test(e.message)) {
      const recordingPath = await video?.path().catch(() => undefined);
      const recordingLink = recordingPath ? `\nPLAYWRIGHT_VIDEO: ${recordingPath}` : "";
      throw new Error(`${formatRendererCrash(await readLinuxMemorySnapshot())}${recordingLink}`);
    }
    throw new Error("ConstructExport failed: " + e.message);
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
    await cleanup();
  }
};

export const constructVersionValidator = (options: any) => {
  void options;
  return v.pipe(v.string(), v.regex(/^\d+(-\d+)?$/, "Invalid version"));
};
