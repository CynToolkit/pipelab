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
import type { Dirent } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, delimiter, resolve, sep } from "node:path";
import { mkdir, readdir, stat, copyFile, chmod, rm, open } from "node:fs/promises";
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
      "Your Construct password. The local export process sends it directly to Construct's account service to sign in.",
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

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new Error("Construct export cancelled");

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError(signal);
};

const waitForAbortableDelay = (duration: number, signal: AbortSignal) =>
  new Promise<void>((resolveDelay, rejectDelay) => {
    if (signal.aborted) {
      rejectDelay(abortError(signal));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      rejectDelay(abortError(signal));
    };
    timer = setTimeout(() => {
      cleanup();
      resolveDelay();
    }, duration);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });

const isProfileSyncRequired = (relativePath: string): boolean => {
  const segments = relativePath.split(sep).filter(Boolean);
  if (segments.length === 0) return true;

  const [first, second] = segments;
  if (first === "Default") return isProfileSyncRequired(segments.slice(1).join(sep));
  if (first === "Preferences" || first === "Extensions" || first === "Local Storage") {
    return true;
  }
  if (first === "IndexedDB") {
    return segments.length === 1 || /construct\.net/i.test(second ?? "");
  }
  return false;
};

const formatProfileSyncError = (path: string, error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to sync required Construct profile data at "${path}": ${detail}`);
};

const validateProfilePreferences = async (source: string): Promise<void> => {
  const path = join(source, "Preferences");
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Preferences is not a regular file");
    const file = await open(path, "r");
    await file.close();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Selected Chromium profile needs a readable regular Preferences file at "${path}": ${detail}`,
    );
  }
};

async function resilientCopy(
  src: string,
  dest: string,
  relativePath: string,
  log: (...args: unknown[]) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  throwIfAborted(abortSignal);
  const required = isProfileSyncRequired(relativePath);

  try {
    const s = await stat(src);
    if (s.isDirectory()) {
      await mkdir(dest, { recursive: true });
      const entries = await readdir(src, { withFileTypes: true });
      const sourceEntries = new Map(entries.map((entry) => [entry.name, entry]));
      const destinationEntries = await readdir(dest, { withFileTypes: true }).catch(
        (error: unknown): Dirent[] => {
          if (required) throw formatProfileSyncError(dest, error);
          return [];
        },
      );
      for (const entry of destinationEntries) {
        throwIfAborted(abortSignal);
        if (transientProfileEntries.has(entry.name)) continue;
        const sourceEntry = sourceEntries.get(entry.name);
        if (!sourceEntry || sourceEntry.isDirectory() !== entry.isDirectory()) {
          const staleRelativePath = [relativePath, entry.name].filter(Boolean).join(sep);
          await rm(join(dest, entry.name), { recursive: true, force: true }).catch(
            (error: unknown) => {
              if (isProfileSyncRequired(staleRelativePath)) {
                throw formatProfileSyncError(join(dest, entry.name), error);
              }
            },
          );
        }
      }
      for (const entry of entries) {
        throwIfAborted(abortSignal);
        if (transientProfileEntries.has(entry.name)) {
          log(`  Skipping transient Chromium profile data: ${entry.name}`);
          continue;
        }
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        const childRelativePath = [relativePath, entry.name].filter(Boolean).join(sep);
        await resilientCopy(srcPath, destPath, childRelativePath, log, abortSignal);
      }
      throwIfAborted(abortSignal);
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
        if (required) throw formatProfileSyncError(src, err);
        log(`    [WARNING] Failed to copy file ${src}: ${err}`);
      }
    }
  } catch (err) {
    if (abortSignal?.aborted) throw abortError(abortSignal);
    if (required) throw formatProfileSyncError(src, err);
    log(`  [WARNING] Failed to access ${src}: ${err}`);
  }
}

const profileLockNames = new Set(["LOCK", "SingletonCookie", "SingletonLock", "SingletonSocket"]);

const removeProfileLocks = async (
  root: string,
  relativePath = "",
  abortSignal?: AbortSignal,
): Promise<void> => {
  throwIfAborted(abortSignal);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isProfileSyncRequired(relativePath)) throw formatProfileSyncError(root, error);
    return;
  }

  for (const entry of entries) {
    throwIfAborted(abortSignal);
    const path = join(root, entry.name);
    const childRelativePath = [relativePath, entry.name].filter(Boolean).join(sep);
    if (entry.isDirectory()) {
      await removeProfileLocks(path, childRelativePath, abortSignal);
    } else if (profileLockNames.has(entry.name)) {
      await rm(path, { force: true }).catch((error: unknown) => {
        if (isProfileSyncRequired(childRelativePath)) throw formatProfileSyncError(path, error);
      });
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
  log: (...args: unknown[]) => void = () => {},
  abortSignal?: AbortSignal,
) => {
  throwIfAborted(abortSignal);
  await validateProfilePreferences(source);
  const playwrightProfile = join(destination, "Default");
  await resilientCopy(source, playwrightProfile, "", log, abortSignal);
  throwIfAborted(abortSignal);
  await removeProfileLocks(playwrightProfile, "", abortSignal);
  throwIfAborted(abortSignal);
};

const isLockConflict = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ELOCKED";

export const acquireManagedProfileLock = async (
  profilePath: string,
  abortSignal: AbortSignal,
): Promise<() => Promise<void>> => {
  for (;;) {
    throwIfAborted(abortSignal);
    try {
      const release = await lockfile.lock(profilePath, {
        stale: 60_000,
        update: 20_000,
        retries: 0,
      });
      if (abortSignal.aborted) {
        await release().catch(() => {});
        throw abortError(abortSignal);
      }
      return release;
    } catch (error) {
      if (abortSignal.aborted) throw abortError(abortSignal);
      if (!isLockConflict(error)) throw error;
      await waitForAbortableDelay(250, abortSignal);
    }
  }
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
    throwIfAborted(abortSignal);
    // const { addonsFolder } = newInputs

    const { thirdparty, node } = paths;

    const browserName = "chromium";

    const packageResolutionStartedAt = Date.now();
    const { packageDir: playwrightPkgPath } = await fetchPackage("playwright-core", "1.62.1", {
      installDeps: true,
      context: ctx,
    });
    throwIfAborted(abortSignal);
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
    throwIfAborted(abortSignal);
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
    managedProfileLock = await acquireManagedProfileLock(managedProfile, abortSignal);

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
      await preparePlaywrightProfile(seedProfile, managedProfile, log, abortSignal);
    }
    throwIfAborted(abortSignal);
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
      throw abortError(abortSignal);
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
