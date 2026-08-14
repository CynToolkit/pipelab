import { getBinName } from "@pipelab/constants";
import {
  ActionRunnerData,
  createAction,
  createArray,
  createBooleanParam,
  createNumberParam,
  createPathParam,
  createStringParam,
  detectRuntime,
  InputsDefinition,
  OutputsDefinition,
  runPnpm,
  runWithLiveLogs,
  fetchPipelabAsset,
} from "@pipelab/plugin-core";
import { dirname, join, basename, delimiter, sep } from "node:path";
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { cp, mkdir, readFile as readFilePromise, writeFile as writeFilePromise } from "node:fs/promises";
import { homedir, platform as osPlatform, arch as osArch } from "node:os";
import { execa } from "execa";
import { kebabCase } from "change-case";
import { parseTOML, stringifyTOML } from "confbox";

/**
 * Searches for common cargo paths and resolves to a valid cargo executable path
 * @returns The path to the cargo executable
 * @throws Error if cargo cannot be found
 */
async function resolveCargoPath(): Promise<string> {
  const cargoBinName = osPlatform() === "win32" ? "cargo.exe" : "cargo";

  // Common cargo paths by platform
  const commonPaths: string[] = [];
  const currentPlatform = osPlatform();

  // Helper function to add paths if they exist
  const addIfExists = (path: string) => {
    if (existsSync(path)) {
      commonPaths.push(path);
    }
  };

  const rustupHome = process.env.RUSTUP_HOME || join(homedir(), ".rustup");
  const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");

  if (currentPlatform === "win32") {
    // Windows paths
    addIfExists(
      join(rustupHome, "toolchains", "stable-x86_64-pc-windows-msvc", "bin", cargoBinName),
    );
    addIfExists(
      join(rustupHome, "toolchains", "nightly-x86_64-pc-windows-msvc", "bin", cargoBinName),
    );
    addIfExists(join(cargoHome, "bin", cargoBinName));
  } else if (currentPlatform === "linux") {
    // Linux paths
    addIfExists(
      join(rustupHome, "toolchains", "stable-x86_64-unknown-linux-gnu", "bin", cargoBinName),
    );
    addIfExists(
      join(rustupHome, "toolchains", "nightly-x86_64-unknown-linux-gnu", "bin", cargoBinName),
    );
    addIfExists(join(cargoHome, "bin", cargoBinName));
    addIfExists("/usr/bin/cargo");
    addIfExists("/usr/local/bin/cargo");
  } else if (currentPlatform === "darwin") {
    // macOS paths
    addIfExists(join(rustupHome, "toolchains", "stable-x86_64-apple-darwin", "bin", cargoBinName));
    addIfExists(join(rustupHome, "toolchains", "nightly-x86_64-apple-darwin", "bin", cargoBinName));
    addIfExists(join(cargoHome, "bin", cargoBinName));
    addIfExists("/usr/local/bin/cargo");
    addIfExists("/opt/homebrew/bin/cargo");
  }

  // Return first existing path found
  if (commonPaths.length > 0) {
    return commonPaths[0];
  }

  // Fallback: try to find cargo using system tools on Unix systems
  if (currentPlatform !== "win32") {
    try {
      const whichResult = await execa("which", ["cargo"]);
      const cargoPath = whichResult.stdout.trim();
      if (cargoPath && existsSync(cargoPath)) {
        return cargoPath;
      }
    } catch {
      // Ignore errors from which command
    }
  }

  throw new Error("Cargo not found. Please install it first");
}

/**
 * Resolves the target token accepted by the `tauri android/ios build --target`
 * flag (an Android ABI or an iOS device/simulator slice), or undefined to let
 * Tauri pick its default.
 */
function resolveMobileCliTarget(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string | undefined {
  if (platform === "android") {
    switch (arch) {
      case "arm64":
        return "aarch64";
      case "x64":
        return "x86_64";
      case "ia32":
        return "i686";
      case "armv7l":
        return "armv7";
      default:
        return "aarch64"; // mobile defaults to 64-bit ARM
    }
  }

  if (platform === "ios") {
    // iOS simulators use the `-sim` slice
    if (arch === "x64" || arch === "ia32") {
      return "x86_64-sim";
    }
    if (arch === "arm64") {
      // Apple Silicon simulators build for the `aarch64-sim` slice;
      // fall back to the device slice on non-Apple hosts.
      return process.platform === "darwin" ? "aarch64-sim" : "aarch64";
    }
    return "aarch64"; // physical devices
  }

  return undefined;
}

/**
 * Resolves the Rust target triple actually produced by the build, used to
 * locate the generated artifact on disk.
 */
function resolveMobileOutputTriple(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string | undefined {
  if (platform === "android") {
    switch (arch) {
      case "x64":
        return "x86_64-linux-android";
      case "ia32":
        return "i686-linux-android";
      case "armv7l":
        return "armv7-linux-androideabi";
      default:
        return "aarch64-linux-android";
    }
  }

  if (platform === "ios") {
    if (arch === "x64" || arch === "ia32") {
      return "x86_64-apple-ios-sim";
    }
    if (arch === "arm64") {
      return "aarch64-apple-ios-sim";
    }
    return "aarch64-apple-ios";
  }

  return undefined;
}

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = "tauri:make";
export const IDPackageV2 = "tauri:package:v2";
export const IDPreview = "tauri:preview";

const paramsInputFolder = {
  "input-folder": createPathParam("", {
    label: "Folder to package",
    required: true,
    control: {
      type: "path",
      options: {
        properties: ["openDirectory"],
      },
    },
  }),
} satisfies InputsDefinition;

const paramsInputURL = {
  "input-url": createStringParam("", {
    label: "URL to preview",
    required: true,
  }),
} satisfies InputsDefinition;

const params = {
  arch: {
    value: "" as NodeJS.Architecture | "", // MakeOptions['arch'],
    label: "Architecture",
    required: false,
    control: {
      type: "select",
      options: {
        placeholder: "Architecture",
        options: [
          {
            label: "Older PCs (ia32)",
            value: "ia32",
          },
          {
            label: "Modern PCs (x64)",
            value: "x64",
          },
          {
            label: "Older Mobile/Pi (armv7l)",
            value: "armv7l",
          },
          {
            label: "New Mobile/Apple Silicon (arm64)",
            value: "arm64",
          },
          {
            label: "Mac Universal (universal)",
            value: "universal",
          },
          {
            label: "Special Systems (mips64el)",
            value: "mips64el",
          },
        ],
      },
    },
  },
  platform: {
    value: "" as NodeJS.Platform | "", // MakeOptions['platform'],
    label: "Platform",
    required: false,
    control: {
      type: "select",
      options: {
        placeholder: "Platform",
        options: [
          {
            label: "Windows (win32)",
            value: "win32",
          },
          {
            label: "macOS (darwin)",
            value: "darwin",
          },
          {
            label: "Linux (linux)",
            value: "linux",
          },
          {
            label: "Android",
            value: "android",
          },
          {
            label: "iOS",
            value: "ios",
          },
        ],
      },
    },
  },
  configuration: {
    label: "Tauri configuration",
    value: undefined as Partial<DesktopApp.Tauri> | undefined,
    required: true,
    control: {
      type: "json",
    },
  },
} satisfies InputsDefinition;

export const configureParams = {
  name: createStringParam("Pipelab", {
    label: "Application name",
    description: "The name of the application",
    required: true,
  }),
  appBundleId: createStringParam("com.pipelab.app", {
    label: "Application bundle ID",
    description: "The bundle ID of the application",
    required: true,
  }),
  appCopyright: createStringParam("Copyright © 2024 Pipelab", {
    label: "Application copyright",
    description: "The copyright of the application",
    required: false,
  }),
  appVersion: createStringParam("1.0.0", {
    label: "Application version",
    description: "The version of the application",
    required: true,
  }),
  icon: createPathParam("", {
    label: "Application icon",
    description: "The icon of the application. macOS: .icns. Windows: .ico",
    required: false,
    control: {
      type: "path",
      options: {
        filters: [
          { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "ico", "icns"] },
        ],
      },
      label: "Path to an image file",
    },
  }),
  author: createStringParam("Pipelab", {
    label: "Application author",
    description: "The author of the application",
    required: true,
  }),
  description: createStringParam("A simple Electron application", {
    label: "Application description",
    description: "The description of the application",
    required: false,
  }),

  appCategoryType: createStringParam("public.app-category.developer-tools", {
    platforms: ["darwin"],
    label: "Application category type",
    description: "The category type of the application",
    required: false,
  }),

  // window
  width: createNumberParam(800, {
    label: "Window width",
    description: "The width of the window",
    required: false,
  }),
  height: createNumberParam(600, {
    label: "Window height",
    description: "The height of the window",
    required: false,
  }),
  fullscreen: {
    label: "Fullscreen",
    value: false,
    description: "Whether to start the application in fullscreen mode",
    required: false,
    control: {
      type: "boolean",
    },
  },
  frame: {
    label: "Frame",
    value: true,
    description: "Whether to show the window frame",
    required: false,
    control: {
      type: "boolean",
    },
  },
  transparent: {
    label: "Transparent",
    value: false,
    description: "Whether to make the window transparent",
    required: false,
    control: {
      type: "boolean",
    },
  },
  toolbar: {
    label: "Toolbar",
    value: true,
    description: "Whether to show the toolbar",
    required: false,
    control: {
      type: "boolean",
    },
  },
  alwaysOnTop: {
    label: "Always on top",
    value: false,
    description: "Whether to always keep the window on top",
    required: false,
    control: {
      type: "boolean",
    },
  },

  tauriVersion: createStringParam("", {
    label: "Tauri version",
    description:
      "The version of Tauri to use. If no version specified, it will use the latest one.",
    required: false,
  }),
  enableExtraLogging: {
    required: false,
    label: "Enable extra logging",
    value: false,
    control: {
      type: "boolean",
    },
    description: "Whether to enable extra logging of internal tools while bundling",
  },
  openDevtoolsOnStart: createBooleanParam(false, {
    label: "Open devtools on app start",
    required: false,
    description: "Whether to open devtools on app start",
  }),

  // websocket apis
  websocketApi: {
    required: false,
    label: "WebSocket APIs to allow (empty = all)",
    value: "[]",
    control: {
      type: "array",
      options: {
        kind: "text",
      },
    },
  },
  ignore: createArray<(string | RegExp)[]>(
    `[
  // use 'src/app/' as starting point
]`,
    {
      required: false,
      label: "Folders to ignore",
      description:
        "An array of string or Regex that allow ignoring certain files or folders from being packaged",
      control: {
        type: "array",
        options: {
          kind: "text",
        },
      },
    },
  ),

  // integrations

  enableSteamSupport: {
    required: false,
    label: "Enable steam support",
    description: "Whether to enable Steam support",
    value: false,
    control: {
      type: "boolean",
    },
  },
  steamGameId: createNumberParam(480, {
    required: false,
    label: "Steam game ID",
    description: "The Steam game ID",
  }),
  enableDiscordSupport: {
    required: false,
    label: "Enable Discord support",
    description: "Whether to enable Discord support",
    value: false,
    control: {
      type: "boolean",
    },
  },
  discordAppId: createStringParam("", {
    required: false,
    label: "Discord application ID",
    description: "The Discord application ID",
  }),

  // Mobile specific configuration (android/ios). Merged into the generated
  // `app.mobile` section of tauri.conf.json when packaging for a mobile target.
  mobileConfig: {
    label: "Mobile configuration",
    required: false,
    description:
      "Optional Tauri mobile configuration (android/ios overrides). Only used when packaging for a mobile platform.",
    value: "{}",
    control: {
      type: "json",
    },
  },
} satisfies InputsDefinition;

const outputs = {
  output: {
    label: "Output",
    value: "",
    control: {
      type: "path",
      options: {
        properties: ["openDirectory"],
      },
    },
  },
  binary: {
    label: "Binary",
    value: "",
    control: {
      type: "path",
      options: {
        properties: ["openFile"],
      },
    },
  },
} satisfies OutputsDefinition;

// type Inputs = ParamsToInput<typeof params>

export const createMakeProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
) =>
  createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    params: {
      ...params,
      ...paramsInputFolder,
    },
    outputs,
  });

export const createPackageV2Props = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
  advanced?: boolean,
  deprecated?: boolean,
  deprecatedMessage?: string,
  disabled?: false,
  updateAvailable?: boolean,
) => {
  const { arch, platform } = params;
  return createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    advanced,
    deprecated,
    deprecatedMessage,
    disabled,
    updateAvailable,
    params: {
      arch,
      platform,
      ...paramsInputFolder,
      ...configureParams,
    },
    outputs: outputs,
  });
};

/**
 * Keeps the npm `@tauri-apps/*` packages in lock-step with the Rust Tauri
 * crates used by the scaffolded app. Tauri aborts the build when the major.minor
 * of an npm package and its matching Rust crate diverge, but the two ecosystems
 * float independently (e.g. `^2` on npm vs `"2"` in Cargo.toml can resolve to
 * different minors depending on what each registry currently serves). Reading the
 * actual resolved crate versions from `cargo metadata` and pinning the npm
 * packages to them guarantees a match.
 */
const TAURI_NPM_MAP: Record<string, string> = {
  tauri: "@tauri-apps/api",
  "tauri-plugin-shell": "@tauri-apps/plugin-shell",
  "tauri-plugin-fs": "@tauri-apps/plugin-fs",
  "tauri-plugin-opener": "@tauri-apps/plugin-opener",
  "tauri-plugin-devtools": "@tauri-apps/plugin-devtools",
  "tauri-plugin-localhost": "@tauri-apps/plugin-localhost",
};

async function alignTauriNpmVersions(
  destinationFolder: string,
  cargo: string,
  node: string,
  log: (message: string) => void,
): Promise<void> {
  const srcTauri = join(destinationFolder, "src-tauri");
  try {
    const { stdout } = await execa(cargo, ["metadata", "--format-version", "1"], {
      cwd: srcTauri,
      env: {
        ...process.env,
        PATH: `${dirname(cargo)}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
      },
    });
    const meta = JSON.parse(stdout) as { packages?: { name: string; version: string }[] };
    const versions: Record<string, string> = {};
    for (const p of meta.packages ?? []) versions[p.name] = p.version;

    const pkgPath = join(destinationFolder, "package.json");
    const pkg = JSON.parse(await readFilePromise(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    let changed = false;
    for (const [crate, npm] of Object.entries(TAURI_NPM_MAP)) {
      const version = versions[crate];
      if (!version) continue;
      if (pkg.dependencies?.[npm]) {
        pkg.dependencies[npm] = version;
        changed = true;
      }
      if (pkg.devDependencies?.[npm]) {
        pkg.devDependencies[npm] = version;
        changed = true;
      }
    }

    if (changed) {
      log("Aligning @tauri-apps npm versions to resolved Rust crate versions");
      await writeFilePromise(pkgPath, JSON.stringify(pkg, null, 2));
    }
  } catch (error) {
    log(`Skipping tauri npm version alignment: ${String(error)}`);
  }
}

const ANDROID_CMDLINE_TOOLS_URL =
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip";

/**
 * Recursively finds the produced Android APK under the Gradle outputs folder.
 * Tauri may name/locate it differently (e.g. `app-universal-release-unsigned.apk`
 * inside a `universal/release` subfolder) depending on the build target, so we
 * search for it instead of hard-coding a single path.
 */
function findAndroidApk(root: string): string | undefined {
  if (!existsSync(root)) return undefined;
  let releaseApk: string | undefined;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith(".apk")) {
        const isRelease = p.split(sep).includes("release");
        if (isRelease && !releaseApk) {
          releaseApk = p;
        } else if (!releaseApk) {
          releaseApk = p;
        }
      }
    }
  };
  walk(root);
  return releaseApk;
}

/**
 * Looks for an already-installed Android SDK on the host so we can reuse it
 * instead of downloading one. Checks `ANDROID_HOME`, the conventional
 * `~/Android/Sdk` location, common version managers (mise/asdf) and `/opt`.
 */
function findExistingAndroidSdk(): string | undefined {
  const candidates: string[] = [];
  if (process.env.ANDROID_HOME) candidates.push(process.env.ANDROID_HOME);
  candidates.push(join(homedir(), "Android", "Sdk"));
  const miseBase = join(homedir(), ".local", "share", "mise", "installs", "android-sdk");
  if (existsSync(miseBase)) {
    try {
      for (const entry of readdirSync(miseBase)) candidates.push(join(miseBase, entry));
    } catch {
      /* ignore */
    }
  }
  candidates.push("/opt/android-sdk", "/usr/lib/android-sdk");
  for (const candidate of candidates) {
    if (
      existsSync(candidate) &&
      (existsSync(join(candidate, "cmdline-tools")) ||
        existsSync(join(candidate, "platform-tools")) ||
        existsSync(join(candidate, "ndk")))
    ) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Downloads the Android command-line tools and uses `sdkmanager` to install the
 * NDK, build-tools, platform and platform-tools required to build a Tauri app.
 */
async function provisionAndroidSdk(
  androidHome: string,
  log: (message: string) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  await mkdir(join(androidHome, "cmdline-tools"), { recursive: true });
  const zipPath = join(androidHome, "commandlinetools.zip");
  log(`Downloading Android command-line tools from ${ANDROID_CMDLINE_TOOLS_URL}`);
  await execa("curl", ["-sL", ANDROID_CMDLINE_TOOLS_URL, "-o", zipPath], {
    cancelSignal: abortSignal as any,
  });
  const extractDir = join(androidHome, "cmdline-tools-extract");
  await execa("unzip", ["-q", "-o", zipPath, "-d", extractDir], {
    cancelSignal: abortSignal as any,
  });
  // The archive extracts to a `cmdline-tools/` folder; Tauri expects it at
  // `cmdline-tools/latest`.
  const extracted = join(extractDir, "cmdline-tools");
  const target = join(androidHome, "cmdline-tools", "latest");
  await execa("rm", ["-rf", target], { cancelSignal: abortSignal as any });
  await execa("mv", [extracted, target], { cancelSignal: abortSignal as any });
  await execa("rm", ["-rf", extractDir, zipPath], { cancelSignal: abortSignal as any });

  const sdkmanager = join(target, "bin", "sdkmanager");
  const env = { ...process.env, ANDROID_HOME: androidHome };
  log("Accepting Android SDK licenses");
  await execa("bash", ["-c", `yes | "${sdkmanager}" --licenses`], {
    env,
    cancelSignal: abortSignal as any,
  });
  log("Installing Android SDK packages (NDK, build-tools, platform, platform-tools)");
  await execa(
    "bash",
    [
      "-c",
      `"${sdkmanager}" --install "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;26.1.10909125"`,
    ],
    { env, cancelSignal: abortSignal as any },
  );
}

/**
 * Self-heals the Android toolchain so a pipeline can build for Android on a host
 * that ships without the Android SDK pre-installed (only node/pnpm + a Rust
 * toolchain are assumed). It reuses an existing SDK when present and otherwise
 * downloads the command-line tools and provisions the NDK/build-tools/platform
 * into a cache directory, then exposes it via `ANDROID_HOME`.
 */
async function ensureAndroidEnvironment(
  cacheDir: string,
  cargoBinDir: string,
  node: string,
  log: (message: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  const existing = findExistingAndroidSdk();
  const androidHome =
    existing ?? join(cacheDir, "android-sdk");

  if (existing) {
    log(`Reusing existing Android SDK at ${androidHome}`);
  } else {
    log(`No Android SDK found; provisioning one at ${androidHome}`);
    await provisionAndroidSdk(androidHome, log, abortSignal);
  }

  log(`Ensuring Rust target aarch64-linux-android for Android builds`);
  try {
    await execa("rustup", ["target", "add", "aarch64-linux-android"], {
      env: {
        ...process.env,
        PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
      },
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch (error) {
    log(`rustup target add aarch64-linux-android failed (continuing): ${String(error)}`);
  }

  process.env.ANDROID_HOME = androidHome;
  return androidHome;
}

export const createPreviewProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
) =>
  createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    params: {
      ...params,
      ...paramsInputURL,
    },
    outputs: outputs,
  });

export const tauri = async (
  action: "make" | "package" | "preview",
  appFolder: string | undefined,
  { cwd, log, inputs, setOutput, paths, abortSignal, context, setArtifact }: ActionRunnerData<any>,
  completeConfiguration: DesktopApp.Config,
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  console.log("appFolder", appFolder);

  log("Building tauri");

  if (action !== "preview") {
    await detectRuntime(appFolder);
  }

  const { modules, cache, node } = paths;

  const destinationFolder = join(cwd, "build");

  const rawAssetFolder = await fetchPipelabAsset("@pipelab/asset-tauri", "^1.0.0", { context });
  const templateFolder = join(rawAssetFolder, "template");

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      // log('src', src)
      // log('dest', dest)
      // TODO: support other oses
      return (
        basename(src) !== "node_modules" &&
        !src.includes("src-tauri\\target") &&
        !src.includes("src-tauri\\gen")
      );
    },
  });

  const placeAppFolder = join(destinationFolder, "src", "app");

  // if input is folder, copy folder to destination
  if (appFolder && action !== "preview") {
    // copy app to template
    await cp(appFolder, placeAppFolder, { recursive: true });
  }

  writeFilePromise(
    join(destinationFolder, "config.cjs"),
    `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
    "utf8",
  );

  const sanitizedName = kebabCase(completeConfiguration.name);

  // package.json update
  log("Package.json update");
  const pkgJSONPath = join(destinationFolder, "package.json");
  const pkgJSONContent = await readFilePromise(pkgJSONPath, "utf8");
  const pkgJSON = JSON.parse(pkgJSONContent);
  log("Setting name to", sanitizedName);
  pkgJSON.name = sanitizedName;
  log("Setting productName to", completeConfiguration.name);
  pkgJSON.productName = completeConfiguration.name;
  await writeFilePromise(pkgJSONPath, JSON.stringify(pkgJSON, null, 2));

  // Cargo.toml update
  log("Cargo.toml update");
  const cargoTomlPath = join(destinationFolder, "src-tauri", "Cargo.toml");
  const cargoTomlContent = await readFilePromise(cargoTomlPath, "utf8");
  const cargoToml = parseTOML(cargoTomlContent) as { name: string; version: string };
  log("Setting name to", sanitizedName);
  console.log("cargoToml", cargoToml);
  cargoToml.name = sanitizedName;
  log("Setting version to", completeConfiguration.appVersion);
  cargoToml.version = completeConfiguration.appVersion;
  console.log("cargoToml", stringifyTOML(cargoToml));
  await writeFilePromise(cargoTomlPath, stringifyTOML(cargoToml));

  // tauri.conf.json update
  log("Tauri.conf.json update");
  const tauriConfJSONPath = join(destinationFolder, "src-tauri", "tauri.conf.json");
  const tauriConfJSONContent = await readFilePromise(tauriConfJSONPath, "utf8");
  const tauriConfJSON = JSON.parse(tauriConfJSONContent);
  log("Setting productName to", completeConfiguration.name);
  tauriConfJSON.productName = completeConfiguration.name;
  log("Setting version to", completeConfiguration.appVersion);
  tauriConfJSON.version = completeConfiguration.appVersion;
  log("Setting identifier to", completeConfiguration.appBundleId);
  tauriConfJSON.identifier = completeConfiguration.appBundleId;

  const isAndroid = inputs.platform === "android";
  const isIOS = inputs.platform === "ios";
  const isMobile = isAndroid || isIOS;

  if (isMobile) {
    tauriConfJSON.bundle = tauriConfJSON.bundle || {};
    // Mobile artifacts (APK/AAB/IPA) are produced by `tauri android/ios build`
    // itself; the `bundle.targets` enum only knows desktop formats, so we use
    // "all" (the schema-valid catch-all) and let the platform drive the output.
    tauriConfJSON.bundle.targets = "all";
    // `app.mobile` is optional and only understood by newer Tauri versions.
    // It is intentionally omitted here so the generated config validates
    // against every Tauri 2.x release; mobile-specific settings from
    // `completeConfiguration.mobile` can be applied to the generated
    // android/ios project after `tauri <platform> init` when desired.
    if (tauriConfJSON.app) {
      delete (tauriConfJSON.app as Record<string, unknown>).mobile;
    }
    log("Setting mobile bundle target to", tauriConfJSON.bundle.targets);
  }

  if (action === "preview") {
    log("Setting build.devUrl to", appFolder);
    tauriConfJSON.build.devUrl = appFolder;
  } else {
    log("Setting build.frontendDist to ../src/app");
    tauriConfJSON.build.frontendDist = "../src/app";
  }
  await writeFilePromise(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2));

  // Pin the npm @tauri-apps packages to the Rust crate versions so the Tauri
  // CLI version check passes (see alignTauriNpmVersions).
  const cargoForAlign = await resolveCargoPath();
  await alignTauriNpmVersions(destinationFolder, cargoForAlign, node, log);

  log("Installing packages");
  const { all } = await runPnpm(destinationFolder, {
    signal: abortSignal,
    context,
  });
  if (all) log(all);

  // override tauri version
  // if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
  //   log(`Installing tauri@${completeConfiguration.electronVersion}`)
  //   await runWithLiveLogs(
  //     process.execPath,
  //     [pnpm, 'install', `tauri@${completeConfiguration.electronVersion}`, '--prefer-offline'],
  //     {
  //       cwd: destinationFolder,
  //       env: {
  //         // DEBUG: '*',
  //         PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
  //         PNPM_HOME: pnpmHome
  //       },
  //       cancelSignal: abortSignal
  //     },
  //     log,
  //     {
  //       onStderr(data) {
  //         log(data)
  //       },
  //       onStdout(data) {
  //         log(data)
  //       }
  //     }
  //   )
  // }

    const inputPlatform = inputs.platform === "" ? undefined : inputs.platform;
    const inputArch = inputs.arch === "" ? undefined : inputs.arch;

    try {
      log("typeof inputs.platform", typeof inputs.platform);
      const finalPlatform: NodeJS.Platform = inputPlatform ?? osPlatform();
      log("finalPlatform", finalPlatform);
      const finalArch: NodeJS.Architecture = inputArch ?? (osArch() as NodeJS.Architecture);
      log("finalArch", finalArch);

      const isAndroidBuild = finalPlatform === "android";
      const isIOSBuild = finalPlatform === "ios";
      const isMobileBuild = isAndroidBuild || isIOSBuild;

      // Resolve cargo path using the new function
      const cargo = await resolveCargoPath();
      const cargoBinDir = dirname(cargo);

      log("cargoBinDir", cargoBinDir);
      console.log("cargo", cargo);

      log("destinationFolder", destinationFolder);

      const cargoTargetDir = join(cache, "cargo", "target", completeConfiguration.appBundleId);

      log("cargoTargetDir", cargoTargetDir);

      log("Starting compiling");

      // by default add the tauri cli
      await runWithLiveLogs(
        cargo,
        ["install", "tauri-cli", "--version", "^2.0.0", "--locked"],
        {
          cwd: join(destinationFolder, "src-tauri"),
          env: {
            ...process.env,
            DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
            ELECTRON_NO_ASAR: "1",
            CARGO_TARGET_DIR: cargoTargetDir,
            PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
          },
          cancelSignal: abortSignal,
        },
        log,
        {
          onStderr(data) {
            // on ci, do not log
            if (!process.env.CI) {
              log(data);
            }
          },
          onStdout(data) {
            // on ci, do not log
            if (!process.env.CI) {
              log(data);
            }
          },
        },
      );

      // ---------------------------------------------------------------------------
      // Mobile build path (android / ios)
      // ---------------------------------------------------------------------------
      if (isMobileBuild) {
        // Self-heal the Android toolchain (SDK/NDK + Rust target) when building
        // for Android on a host that doesn't have them installed yet.
        if (isAndroidBuild) {
          // Store the SDK in a pipeline-independent location so it is shared by
          // every Android pipeline instead of being re-downloaded (several GB)
          // per pipeline.
          const androidHome = await ensureAndroidEnvironment(
            context.getCachePath("Pipelines"),
            cargoBinDir,
            node,
            log,
            abortSignal,
          );
          // Make sure the SDK tooling is on PATH for the Tauri CLI / Gradle.
          process.env.PATH = `${join(androidHome, "cmdline-tools", "latest", "bin")}${delimiter}${join(
            androidHome,
            "platform-tools",
          )}${delimiter}${process.env.PATH}`;
          log(`Android SDK ready at ANDROID_HOME=${androidHome}`);
        }

        const cliTarget = resolveMobileCliTarget(finalPlatform, finalArch);
        const outputTriple = resolveMobileOutputTriple(finalPlatform, finalArch);
        const mobileArgs = ["tauri", isAndroidBuild ? "android" : "ios", "build"];
        if (cliTarget) {
          mobileArgs.push("--target", cliTarget);
        }
        if (isAndroidBuild) {
          // Produce a standalone APK in addition to the default AAB
          mobileArgs.push("--apk");
        }

        log(`Building for ${isAndroidBuild ? "android" : "ios"} (target: ${cliTarget ?? "default"})`);

        // `tauri <platform> init` generates the native project
        // (src-tauri/gen/android|ios) required before the first build.
        log(`Initializing ${isAndroidBuild ? "android" : "ios"} project`);
        await runWithLiveLogs(
          cargo,
          ["tauri", isAndroidBuild ? "android" : "ios", "init"],
          {
            cwd: join(destinationFolder, "src-tauri"),
            env: {
              ...process.env,
              DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
              ELECTRON_NO_ASAR: "1",
              CARGO_TARGET_DIR: cargoTargetDir,
              PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
            },
            cancelSignal: abortSignal,
          },
          log,
          {
            onStderr(data) {
              if (!process.env.CI) log(data);
            },
            onStdout(data) {
              if (!process.env.CI) log(data);
            },
          },
        );

        await runWithLiveLogs(cargo, mobileArgs, {
          cwd: join(destinationFolder, "src-tauri"),
          env: {
            ...process.env,
            DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
            ELECTRON_NO_ASAR: "1",
            CARGO_TARGET_DIR: cargoTargetDir,
            PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
          },
          cancelSignal: abortSignal,
        }, log, {
          onStderr(data) {
            if (!process.env.CI) log(data);
          },
          onStdout(data) {
            if (!process.env.CI) log(data);
          },
        });

        if (isAndroidBuild) {
          const apkRoot = join(
            destinationFolder,
            "src-tauri",
            "gen",
            "android",
            "app",
            "build",
            "outputs",
            "apk",
          );
          const apkPath = findAndroidApk(apkRoot) ?? join(apkRoot, "release", "app-release.apk");
          const outFolder = dirname(apkPath);
          const binName = basename(apkPath);
          log("Android APK output", apkPath);
          setOutput("output", outFolder);
          setOutput("binary", apkPath);
          // Persist the APK to the pipeline's artifacts folder so it survives
          // the build sandbox cleanup. The runner copies it to
          // getArtifactsPath(pipelineId, buildId)/<name>.
          setArtifact(binName, apkPath);
          return { folder: outFolder, binary: apkPath };
        }

        // iOS
        const triple = outputTriple || "aarch64-apple-ios";
        const outFolder = join(destinationFolder, "src-tauri", "target", triple, "release");
        const binName = getBinName(sanitizedName, "ios");
        const binPath = join(outFolder, binName);
        log("iOS output", binPath);
        setOutput("output", outFolder);
        setOutput("binary", binPath);
        setArtifact(binName, binPath);
        return { folder: outFolder, binary: binPath };
      }

      // ---------------------------------------------------------------------------
      // Desktop build path (win32 / linux / darwin)
      // ---------------------------------------------------------------------------
      let tauriPlatform = "";
      if (finalPlatform === "win32") {
        tauriPlatform = "pc-windows-msvc";
      } else if (finalPlatform === "linux") {
        tauriPlatform = "unknown-linux-gnu";
      } else if (finalPlatform === "darwin") {
        tauriPlatform = "apple-darwin";
      } else {
        throw new Error(`Unsupported platform: ${finalPlatform}`);
      }

      let target: string;
      if (finalArch === "universal") {
        if (finalPlatform !== "darwin") {
          throw new Error("Universal architecture is only supported on macOS");
        }
        target = "universal-apple-darwin";
      } else {
        let tauriArch = "";
        if (finalArch === "x64") {
          tauriArch = "x86_64";
        } else if (finalArch === "arm64") {
          tauriArch = "aarch64";
        } else if (finalArch === "ia32") {
          tauriArch = "i686";
        } else if (finalArch === "armv7l") {
          tauriArch = "armv7";
        } else {
          throw new Error(`Unsupported arch: ${finalArch}`);
        }
        target = `${tauriArch}-${tauriPlatform}`;
      }

      const cargoOutputPath = join(cargoTargetDir, target, "release");

      log("cargoOutputPath", cargoOutputPath);

      // if preview, run tauri dev
      if (action === "preview") {
        await runWithLiveLogs(
          cargo,
          ["tauri", "dev", "--target", target],
          {
            cwd: join(destinationFolder, "src-tauri"),
            env: {
              ...process.env,
              DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
              ELECTRON_NO_ASAR: "1",
              CARGO_TARGET_DIR: cargoTargetDir,
              PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
            },
            cancelSignal: abortSignal,
          },
          log,
          {
            onStderr(data) {
              log(data);
            },
            onStdout(data) {
              log(data);
            },
          },
        );
      } else {
        // otherwise build, but don't bundle
        await runWithLiveLogs(
          cargo,
          ["tauri", "build", "--target", target, "--no-bundle"],
          {
            cwd: join(destinationFolder, "src-tauri"),
            env: {
              ...process.env,
              DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
              ELECTRON_NO_ASAR: "1",
              CARGO_TARGET_DIR: cargoTargetDir,
              PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
            },
            cancelSignal: abortSignal,
          },
          log,
          {
            onStderr(data) {
              // on ci, do not log
              if (!process.env.CI) {
                log(data);
              }
            },
            onStdout(data) {
              // on ci, do not log
              if (!process.env.CI) {
                log(data);
              }
            },
          },
        );

        // if make, bundle
        if (action === "make") {
          await runWithLiveLogs(
            cargo,
            // TODO: https://v2.tauri.app/fr/distribute/#bundling
            ["tauri", "bundle", "--", "--bundles", "appimage"],
            {
              cwd: join(destinationFolder, "src-tauri"),
              env: {
                DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
                ELECTRON_NO_ASAR: "1",
                CARGO_TARGET_DIR: cargoTargetDir,
                PATH: `${cargoBinDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
              },
              cancelSignal: abortSignal,
            },
            log,
            {
              onStderr(data) {
                log(data);
              },
              onStdout(data) {
                log(data);
              },
            },
          );
        }
      }

      if (action === "package") {
        const binName = getBinName(sanitizedName);

        log("cargoOutputPath", cargoOutputPath);

        setOutput("output", cargoOutputPath);
        setOutput("binary", join(cargoOutputPath, binName));
        return {
          folder: cargoOutputPath,
          binary: join(cargoOutputPath, binName),
        };
      } else if (action === "make") {
        // TODO:
        throw new Error("Unsupported action");
      } else if (action === "preview") {
        // continue
      } else {
        throw new Error("Unsupported action");
        // const output = join(destinationFolder, 'out', 'make')
        // setOutput('output', output)
        // return {
        //   folder: output,
        //   binary: undefined
        // }
      }
    } catch (e) {
    if (e instanceof Error) {
      if (e.name === "RequestError") {
        log("Request error");
      }
      if (e.name === "RequestError") {
        log("Request error");
      }
      throw e;
    }
    log(e);
    return undefined;
  }
};
