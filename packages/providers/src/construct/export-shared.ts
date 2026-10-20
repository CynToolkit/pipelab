import {
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
import type { BrowserContext, Video } from "playwright";
import { createHash } from "node:crypto";
import { dirname, join, delimiter, resolve } from "node:path";
import { mkdir, readdir, stat, copyFile, chmod, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import lockfile from "proper-lockfile";
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
    description: "Run without showing the browser; disable this to watch the export",
    required: false,
    control: {
      type: "boolean",
    },
    value: true,
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
      const sourceEntries = new Map(entries.map((entry) => [entry.name, entry]));
      const destinationEntries = await readdir(dest, { withFileTypes: true }).catch(() => []);
      for (const entry of destinationEntries) {
        if (transientProfileEntries.has(entry.name)) continue;
        const sourceEntry = sourceEntries.get(entry.name);
        if (!sourceEntry || sourceEntry.isDirectory() !== entry.isDirectory()) {
          await rm(join(dest, entry.name), { recursive: true, force: true }).catch(() => {});
        }
      }
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
        } catch {
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
 * Syncs browser state into a Playwright user-data directory while leaving
 * skipped cache directories in the existing destination untouched.
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

export interface ConstructExportExecutionContext {
  cwd: string;
  log: (...args: unknown[]) => void;
  inputs: Record<string, unknown>;
  paths: { thirdparty: string; node: string };
  abortSignal: AbortSignal;
  context: Parameters<typeof fetchPackage>[2]["context"];
  projectId: string;
}

const profileScope = (value: string) => createHash("sha256").update(value).digest("hex");

export const exportc3p = async (
  file: string,
  {
    cwd,
    log,
    inputs,
    paths,
    abortSignal,
    context: ctx,
    projectId,
  }: ConstructExportExecutionContext,
): Promise<{ folder: string; parentFolder: string; zipFile: string }> => {
  const logElapsed = (label: string, startedAt: number) => {
    log(label, `${Date.now() - startedAt} ms`);
  };
  let browserContext: BrowserContext | undefined = undefined;
  let managedProfileLock: (() => Promise<void>) | undefined;
  let video: Video | null | undefined;
  let pageCrashed = false;

  const cleanup = async () => {
    const contextToClose = browserContext;
    const releaseProfileLock = managedProfileLock;
    browserContext = undefined;
    managedProfileLock = undefined;
    await contextToClose?.close().catch(() => {});
    await releaseProfileLock?.().catch(() => {});
  };

  const onAbort = () => {
    console.error("aborted");
    void browserContext?.close().catch(() => {});
  };
  const newInputs = inputs as Inputs;

  abortSignal.addEventListener("abort", onAbort);

  try {
    // const { addonsFolder } = newInputs

    const { thirdparty, node } = paths;

    const browserName = "chromium";

    const packageResolutionStartedAt = Date.now();
    const { packageDir: playwrightPkgPath } = await fetchPackage("playwright-core", "1.62.1", {
      installDeps: true,
      context: ctx,
    });
    logElapsed("Playwright package resolved after", packageResolutionStartedAt);
    const playwrightCli = join(playwrightPkgPath, "cli.js");
    const browsersPath =
      process.env.PLAYWRIGHT_BROWSERS_PATH || join(thirdparty, "playwright-browsers");

    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

    // Resolve through Playwright so its revision and platform-specific directory
    // stay aligned with the installed playwright-core package.
    // Electron's Vite main-process bundle is CommonJS, so use an absolute anchor
    // for createRequire instead of relying on import.meta.url.
    const require = createRequire(join(process.cwd(), "package.json"));
    const playwrightModule = require(join(playwrightPkgPath, "index.js"));
    const playwright = playwrightModule.default || playwrightModule;
    const browserInstance = playwright[browserName];
    const browserExecutable = browserInstance.executablePath();

    const browserBinaryStartedAt = Date.now();
    if (existsSync(browserExecutable)) {
      log("Browser already exists at", browsersPath, "- skipping download");
    } else {
      log("Downloading browser to", browsersPath);
      await runWithLiveLogs(
        node,
        [playwrightCli, "install", browserName, "--no-shell"],
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
    logElapsed("Construct browser binary ready after", browserBinaryStartedAt);

    const downloadDir = join(cwd, "playwright");
    await mkdir(downloadDir, { recursive: true });

    log("Browser downloaded to", downloadDir);

    log("Exporting construct project");

    let version = typeof newInputs.version === "string" ? newInputs.version.trim() : "";
    if (version.toLowerCase() === "latest") version = "";
    if (/^\d+$/.test(version)) version = `r${version}`;
    const headless = newInputs.headless ?? true;
    const browserChannel = "chromium";
    const recordVideo = shouldRecordPlaywrightVideo(process.env.NODE_ENV, isCI)
      ? { dir: downloadDir }
      : undefined;

    const browserSetupStartedAt = Date.now();
    const profileSetupStartedAt = Date.now();
    const username = typeof newInputs.username === "string" ? newInputs.username.trim() : "";
    const seedProfile =
      typeof newInputs.customProfile === "string" ? newInputs.customProfile.trim() : "";
    const profileIdentity = [projectId, username, seedProfile ? resolve(seedProfile) : ""].join(
      "\0",
    );
    const managedProfile = ctx.getCachePath(
      "pipelines",
      "construct",
      "profiles",
      profileScope(profileIdentity),
    );
    await mkdir(managedProfile, { recursive: true, mode: 0o700 });
    await chmod(managedProfile, 0o700).catch(() => {});
    managedProfileLock = await lockfile.lock(managedProfile, {
      stale: 60_000,
      update: 20_000,
      retries: { retries: 120, minTimeout: 250, maxTimeout: 1_000, factor: 1 },
    });
    if (abortSignal.aborted) {
      await cleanup();
      throw abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error("Construct export cancelled");
    }

    if (seedProfile) {
      const managedProfileInitialized = existsSync(join(managedProfile, "Default", "Preferences"));
      log(
        managedProfileInitialized
          ? "Refreshing the project-scoped Construct profile from the selected Chromium profile"
          : "Seeding the project-scoped Construct profile from the selected Chromium profile",
      );
      const indexedDbPathSource = join(seedProfile, "IndexedDB");
      if (!existsSync(indexedDbPathSource)) {
        log(`  [WARNING] Source IndexedDB directory does not exist: "${indexedDbPathSource}".`);
      }
      await preparePlaywrightProfile(seedProfile, managedProfile, log);
    }
    logElapsed("Construct managed profile ready after", profileSetupStartedAt);

    log("Using project-scoped Construct profile from Pipelab cache");
    browserContext = await browserInstance.launchPersistentContext(managedProfile, {
      headless,
      channel: browserChannel,
      locale: "en-US",
      recordVideo,
    });

    if (!browserContext) {
      throw new Error("Failed to initialize browser context");
    }
    if (abortSignal.aborted) {
      await cleanup();
      throw abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error("Construct export cancelled");
    }
    log("Using Playwright Chromium channel", browserChannel, "headless", headless);

    const page = await browserContext.newPage();
    video = page.video();
    page.on("crash", () => {
      pageCrashed = true;
      log("Construct renderer crashed");
    });

    const configuredTimeoutSeconds = Number(newInputs.timeout ?? 120);
    const exportTimeoutMs =
      Math.max(1, Number.isFinite(configuredTimeoutSeconds) ? configuredTimeoutSeconds : 120) *
      1000;
    page.setDefaultTimeout(exportTimeoutMs);

    // this exact sequn=ence make it work
    await page.addInitScript(() => {
      // @ts-expect-error dds
      delete self.showOpenFilePicker;
    });
    page.on("filechooser", (worker) => {
      console.log("filechooser created: " + worker.page.name);
    });
    logElapsed("Construct browser initialized after", browserSetupStartedAt);
    // ---------------------------------

    const result = await script(
      page,
      log,
      file,
      newInputs.username as string,
      newInputs.password as string,
      version,
      downloadDir,
      abortSignal,
      exportTimeoutMs,
      Boolean(seedProfile),
      // addonsFolder,
    );

    log("Setting output result to ", result);

    return {
      folder: result, // deprecated output retained for existing workflows
      parentFolder: dirname(result),
      zipFile: result,
    };
  } catch (e: any) {
    log("error, no result, crashed", e);
    // Playwright finalizes the video when its context closes. Close it before
    // asking for the path so failed automation runs can expose the recording.
    await cleanup();
    const recordingPath = await video?.path().catch((): undefined => undefined);
    const recordingLink = recordingPath ? `\nPLAYWRIGHT_VIDEO: ${recordingPath}` : "";
    if (recordingPath) log(`PLAYWRIGHT_VIDEO: ${recordingPath}`);
    if (pageCrashed || /(?:page|target) crashed/i.test(e.message)) {
      throw new Error(`${formatRendererCrash(await readLinuxMemorySnapshot())}${recordingLink}`);
    }
    throw new Error("ConstructExport failed: " + e.message + recordingLink);
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
    await cleanup();
  }
};

export const constructVersionValidator = (options: any) => {
  void options;
  return v.pipe(v.string(), v.regex(/^\d+(-\d+)?$/, "Invalid version"));
};
