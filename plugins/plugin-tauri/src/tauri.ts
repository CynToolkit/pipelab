import { getBinName } from "@pipelab/constants";
import { detectRuntime, runPnpm, runWithLiveLogs, resolveBundledAsset } from "@pipelab/plugin-core";
import { dirname, join, basename, delimiter } from "node:path";
import { existsSync } from "node:fs";
import { cp, readFile as readFilePromise, writeFile as writeFilePromise } from "node:fs/promises";
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

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = "tauri:make";
export const IDPackageV2 = "tauri:package:v2";
export const IDPreview = "tauri:preview";

export interface TauriExecutionContext {
  cwd: string;
  log: (...args: unknown[]) => void;
  inputs: Record<string, unknown>;
  paths: { node: string; cache: string };
  abortSignal: AbortSignal;
  context: Parameters<typeof runPnpm>[1]["context"];
  setOutput?: (key: "output" | "binary", value: string) => void;
}

export const tauri = async (
  action: "make" | "package" | "preview",
  appFolder: string | undefined,
  { cwd, log, inputs, setOutput, paths, abortSignal, context }: TauriExecutionContext,
  completeConfiguration: DesktopApp.Config,
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  console.log("appFolder", appFolder);

  log("Building tauri");

  if (action !== "preview") {
    await detectRuntime(appFolder);
  }

  const { cache, node } = paths;

  const destinationFolder = join(cwd, "build");

  const rawAssetFolder = await resolveBundledAsset("@pipelab/asset-tauri");
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
  if (action === "preview") {
    log("Setting build.devUrl to", appFolder);
    tauriConfJSON.build.devUrl = appFolder;
    await writeFilePromise(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2));
  }
  /* else {
    log('Setting build.frontendDist to', appFolder)
    tauriConfJSON.build.frontendDist = appFolder
    await writeFile(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2))
  } */

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

  const inputPlatform =
    inputs.platform === "win32" || inputs.platform === "linux" || inputs.platform === "darwin"
      ? inputs.platform
      : undefined;
  const inputArch = inputs.arch === "x64" || inputs.arch === "arm64" ? inputs.arch : undefined;

  try {
    log("typeof inputs.platform", typeof inputs.platform);
    const finalPlatform: NodeJS.Platform = inputPlatform ?? osPlatform();
    log("finalPlatform", finalPlatform);
    const finalArch: NodeJS.Architecture = inputArch ?? (osArch() as NodeJS.Architecture);
    log("finalArch", finalArch);

    let tauriPlatform = "";
    if (finalPlatform === "win32") {
      tauriPlatform = "pc-windows-msvc";
    } else if (finalPlatform === "linux") {
      tauriPlatform = "unknown-linux-gnu";
    } else {
      throw new Error("Unsupported platform");
    }

    let tauriArch = "";
    if (finalArch === "x64") {
      tauriArch = "x86_64";
    } else {
      throw new Error("Unsupported arch");
    }

    const target = `${tauriArch}-${tauriPlatform}`;

    // Resolve cargo path using the new function
    const cargo = await resolveCargoPath();
    const cargoBinDir = dirname(cargo);

    log("cargoBinDir", cargoBinDir);
    console.log("cargo", cargo);

    log("destinationFolder", destinationFolder);

    const cargoTargetDir = join(cache, "cargo", "target", completeConfiguration.appBundleId);
    const cargoOutputPath = join(cargoTargetDir, target, "release");

    log("cargoTargetDir", cargoTargetDir);
    log("cargoOutputPath", cargoOutputPath);

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

      setOutput?.("output", cargoOutputPath);
      setOutput?.("binary", join(cargoOutputPath, binName));
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
