import { getBinName, outFolderName } from "@pipelab/constants";
import { runPnpm, runWithLiveLogs, resolveBundledAsset } from "@pipelab/plugin-core";
import { detectRuntime } from "../web-runtime";

import { dirname, join, basename, delimiter } from "node:path";
import { cp, readFile, writeFile, rm, mkdir, appendFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { platform as osPlatform, arch as osArch, tmpdir } from "node:os";
import { kebabCase } from "change-case";
import semver from "semver";
import { pathToFileURL } from "node:url";
import { patchExecutableWithGpupatch } from "./gpupatch";

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const IDMake = "electron:make";
export const IDPackage = "electron:package";
export const IDPackageV2 = "electron:package:v2";
export const IDPackageV3 = "electron:package:v3";
export const IDPreview = "electron:preview";

export interface ForgeExecutionContext {
  cwd: string;
  log: (...args: unknown[]) => void;
  inputs: Record<string, unknown>;
  paths: { node: string; pnpm: string };
  abortSignal: AbortSignal;
  context: Parameters<typeof runPnpm>[1]["context"];
  setOutput?: (key: "output", value: string) => void;
  setArtifact: (
    outputId: string,
    path: string,
    metadata?: { checksum?: string; size?: number; name?: string },
  ) => void;
}

export const forge = async (
  action: "make" | "package" | "preview",
  appFolder: string | undefined,
  { cwd, log, inputs, paths, abortSignal, context, setArtifact, setOutput }: ForgeExecutionContext,
  completeConfiguration: DesktopApp.Electron,
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  log("Building electron");

  if (action !== "preview") {
    await detectRuntime(appFolder, log);
  }

  const { node } = paths;
  const destinationFolder = await context.createTempFolder("electron-forge-");
  log(`Staging build in ${destinationFolder}`);
  let dependencyInstallError: unknown;
  let packageTemporaryFolder: string | undefined;

  try {
    packageTemporaryFolder = await mkdtemp(join(tmpdir(), "pipelab-electron-packager-"));
    const shimDir = join(destinationFolder, ".bin");
    await mkdir(shimDir, { recursive: true });

    const pnpmCjsPath = paths.pnpm;

    if (osPlatform() === "win32") {
      // Write pnpm.cmd for Windows support
      await writeFile(
        join(shimDir, "pnpm.cmd"),
        `@echo off\r\n"${node}" "${pnpmCjsPath}" %*\r\n`,
        "utf8",
      );
    } else {
      // Write pnpm shell script for Unix/Linux/macOS support
      await writeFile(join(shimDir, "pnpm"), `#!/bin/sh\nexec "${node}" "${pnpmCjsPath}" "$@"\n`, {
        encoding: "utf8",
        mode: 0o755,
      });
    }

    const forge = join(
      destinationFolder,
      "node_modules",
      "@electron-forge",
      "cli",
      "dist",
      "electron-forge.js",
    );

    const rawAssetFolder = await resolveBundledAsset("@pipelab/asset-electron", context);
    const templateFolder = join(rawAssetFolder, "template");
    log("templateFolder", templateFolder);
    log("destinationFolder", destinationFolder);

    // copy template to destination
    await cp(templateFolder, destinationFolder, {
      recursive: true,
      filter: (src) => {
        return basename(src) !== "node_modules";
      },
    });

    log("copy done");

    // Force hoisted node-linker for pnpm to avoid electron-forge errors
    await appendFile(join(destinationFolder, ".npmrc"), "\nnode-linker=hoisted\n", "utf-8");

    const pkgJSONPath = join(destinationFolder, "package.json");
    const pkgJSONContent = await readFile(pkgJSONPath, "utf8");
    const sanitizedName = kebabCase(completeConfiguration.name);

    const originalIconPath = completeConfiguration.icon;
    const hasIcon = completeConfiguration.icon !== undefined && completeConfiguration.icon !== "";
    const iconFilename = hasIcon ? basename(completeConfiguration.icon) : "";
    const newIconPath = hasIcon ? join(destinationFolder, iconFilename) : "";
    const relativeIconPath = hasIcon ? join("./", "build", iconFilename) : "";
    const relativeIconPath1 = hasIcon ? join("./", iconFilename) : "";

    log("relativeIconPath", relativeIconPath);
    log("relativeIconPath1", relativeIconPath1);

    const hasElectronVersion =
      completeConfiguration.electronVersion !== undefined &&
      completeConfiguration.electronVersion !== "";
    const configuredCJSOnly =
      hasElectronVersion &&
      semver.lt(semver.coerce(completeConfiguration.electronVersion) || "0.0.0", "28.0.0");
    const customPackages = Array.isArray(completeConfiguration.customPackages)
      ? completeConfiguration.customPackages
      : [];
    const customElectronSpecs = customPackages.filter(
      (packageSpec) => packageSpec === "electron" || packageSpec.startsWith("electron@"),
    );
    const customElectronSpec = customElectronSpecs.at(-1);
    const customElectronMayBeLegacy = customElectronSpecs.some((packageSpec) => {
      const versionRange = packageSpec.startsWith("electron@")
        ? packageSpec.slice("electron@".length)
        : undefined;
      const minimumVersion = versionRange ? semver.minVersion(versionRange) : null;
      return !minimumVersion || semver.lt(minimumVersion, "28.0.0");
    });
    const installLegacySupport = configuredCJSOnly || customElectronMayBeLegacy;
    let isCJSOnly = configuredCJSOnly;

    const pkgJSON = JSON.parse(pkgJSONContent) as Record<string, unknown>;
    const dependencySection = (field: "dependencies" | "devDependencies") => {
      const section = pkgJSON[field];
      if (section === undefined) {
        const created: Record<string, string> = {};
        pkgJSON[field] = created;
        return created;
      }
      if (
        typeof section !== "object" ||
        section === null ||
        Array.isArray(section) ||
        !Object.values(section).every((value) => typeof value === "string")
      ) {
        throw new Error(`Electron template package.json has an invalid ${field} section`);
      }
      return section as Record<string, string>;
    };
    log("Setting name to", sanitizedName);
    pkgJSON.name = sanitizedName;
    log("Setting productName to", completeConfiguration.name);
    pkgJSON.productName = completeConfiguration.name;

    completeConfiguration.icon = relativeIconPath1;

    await writeFile(
      join(destinationFolder, "config.cjs"),
      `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
      "utf8",
    );

    if (installLegacySupport) {
      pkgJSON.type = "commonjs";
    } else {
      pkgJSON.type = "module";
    }

    // Resolve every fixed dependency before pnpm runs so its install can link the
    // complete template in one pass. Custom package specs are added by the same
    // pnpm invocation below, which also resolves the existing manifest.
    if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== "") {
      dependencySection("devDependencies").electron = completeConfiguration.electronVersion;
    }

    if (installLegacySupport) {
      dependencySection("dependencies").execa = "8";
      dependencySection("devDependencies").esbuild = "0.24.0";
    }
    await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2));

    const installArgs = customPackages.length
      ? ["add", ...customPackages, "--prefer-offline"]
      : ["install", "--prefer-offline"];
    log(
      customPackages.length
        ? "Installing Electron dependencies and custom packages in one pnpm invocation"
        : "Installing Electron dependencies in one pnpm invocation",
    );
    const installStartedAt = Date.now();
    try {
      const { all } = await runPnpm(destinationFolder, {
        args: installArgs,
        signal: abortSignal,
        context,
      });
      if (all) log(all);
    } catch (error) {
      dependencyInstallError = error;
      const wasCanceled =
        abortSignal.aborted ||
        (error instanceof Error && (error.name === "AbortError" || error.name === "CancelError")) ||
        (typeof error === "object" &&
          error !== null &&
          "isCanceled" in error &&
          error.isCanceled === true);
      log(
        `Electron dependency installation ${wasCanceled ? "canceled" : "failed"} after ${Date.now() - installStartedAt}ms`,
      );
      throw error;
    }
    log(`Electron dependency installation completed in ${Date.now() - installStartedAt}ms`);

    if (customElectronSpec !== undefined) {
      const installedElectron = JSON.parse(
        await readFile(join(destinationFolder, "node_modules", "electron", "package.json"), "utf8"),
      ) as { version?: unknown };
      if (
        typeof installedElectron.version !== "string" ||
        !semver.valid(installedElectron.version)
      ) {
        throw new Error("The installed Electron package does not declare a valid version");
      }
      completeConfiguration.electronVersion = installedElectron.version;
      isCJSOnly = semver.lt(installedElectron.version, "28.0.0");

      const installedManifest = JSON.parse(await readFile(pkgJSONPath, "utf8")) as Record<
        string,
        unknown
      >;
      installedManifest.type = isCJSOnly ? "commonjs" : "module";
      await writeFile(pkgJSONPath, JSON.stringify(installedManifest, null, 2));
      await writeFile(
        join(destinationFolder, "config.cjs"),
        `module.exports = ${JSON.stringify(completeConfiguration, undefined, 2)}`,
        "utf8",
      );
      log(
        `Using resolved Electron ${installedElectron.version} with ${isCJSOnly ? "CommonJS" : "ES module"} build behavior`,
      );
    }
    if (customElectronSpec === undefined) {
      log("Setting type to", isCJSOnly ? "commonjs" : "module");
    }

    log("done install");

    log("completeConfiguration.icon", completeConfiguration.icon);

    // copy icon
    if (hasIcon) {
      await cp(originalIconPath, newIconPath, { recursive: true });
    }

    // copy custom main code
    const destinationFile = join(destinationFolder, "src", "custom-main.js");
    if (completeConfiguration.customMainCode) {
      await cp(completeConfiguration.customMainCode, destinationFile, { recursive: true });
    } else {
      await writeFile(destinationFile, 'console.log("No custom main code provided")', {
        signal: abortSignal,
      });
    }

    if (isCJSOnly) {
      log(`Installing native esbuild for transpilation...`);
      const esbuildPath = pathToFileURL(
        join(destinationFolder, "node_modules", "esbuild", "lib", "main.js"),
      ).href;
      const esbuild = await import(esbuildPath);

      /* ESBUILD transpilation */
      const external = [
        "electron",
        "@pipelab/steamworks.js",
        "electron",
        "node:*",
        "http",
        "node:stream",
      ];
      await esbuild.build({
        entryPoints: [join(destinationFolder, "src", "index.js")],
        bundle: true,
        write: true,
        format: "cjs",
        platform: "node",
        external,
        outfile: join(destinationFolder, "dist", "index.js"),
      });
      await esbuild.build({
        entryPoints: [join(destinationFolder, "src", "preload.js")],
        bundle: true,
        platform: "node",
        external,
        format: "cjs",
        write: true,
        outfile: join(destinationFolder, "dist", "preload.js"),
      });
      await esbuild.build({
        entryPoints: [join(destinationFolder, "src", "custom-main.js")],
        bundle: true,
        platform: "node",
        external,
        format: "cjs",
        write: true,
        outfile: join(destinationFolder, "dist", "custom-main.js"),
      });
      await rm(join(destinationFolder, "src"), { recursive: true });
      await cp(join(destinationFolder, "dist"), join(destinationFolder, "src"), {
        recursive: true,
      });
      await rm(join(destinationFolder, "dist"), { recursive: true });
      /* ESBUILD transpilation */
    }

    const placeAppFolder = join(destinationFolder, "src", "app");

    // if input is folder, copy folder to destination
    if (appFolder && action !== "preview") {
      // copy app to template
      await cp(appFolder, placeAppFolder, { recursive: true });
    }

    const inputPlatform =
      typeof inputs.platform === "string" ? inputs.platform || undefined : undefined;
    const inputArch = typeof inputs.arch === "string" ? inputs.arch || undefined : undefined;

    try {
      log("typeof inputs.platform", typeof inputs.platform);
      const finalPlatform = inputPlatform ?? osPlatform() ?? "";
      log("finalPlatform", finalPlatform);
      const finalArch = inputArch ?? osArch() ?? "";

      await runWithLiveLogs(
        node,
        [forge, action, /* '--', */ "--arch", finalArch, "--platform", finalPlatform],
        {
          cwd: destinationFolder,
          env: {
            DEBUG: completeConfiguration.enableExtraLogging ? "*" : "",
            ELECTRON_NO_ASAR: "1",
            PATH: `${shimDir}${delimiter}${dirname(node)}${delimiter}${process.env.PATH}`,
            TMP: packageTemporaryFolder,
            TEMP: packageTemporaryFolder,
            TMPDIR: packageTemporaryFolder,
            // DEBUG: "electron-packager"
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

      if (action !== "preview") {
        const originalNoAsar = process.noAsar;
        process.noAsar = true;
        try {
          const outDir = join(destinationFolder, "out");
          if (!existsSync(outDir)) {
            throw new Error("Electron Forge completed without producing an output directory");
          }
          if (action === "package" && completeConfiguration.patchExecutable) {
            const outName = outFolderName(
              completeConfiguration.name,
              finalPlatform as NodeJS.Platform,
              finalArch as NodeJS.Architecture,
            );
            const binary = join(
              outDir,
              outName,
              getBinName(completeConfiguration.name, finalPlatform),
            );
            await patchExecutableWithGpupatch(binary, finalPlatform as NodeJS.Platform, {
              context,
              log,
              abortSignal,
            });
          }
          await cp(outDir, join(cwd, "out"), { recursive: true });
        } finally {
          process.noAsar = originalNoAsar;
        }
      }

      if (action === "package") {
        const outName = outFolderName(
          completeConfiguration.name,
          finalPlatform as NodeJS.Platform,
          finalArch as NodeJS.Architecture,
        );
        const binName = getBinName(completeConfiguration.name, finalPlatform);

        const output = join(cwd, "out", outName);
        if (!existsSync(output)) {
          throw new Error(
            `Electron Forge completed without producing the expected output for ${finalPlatform}/${finalArch}`,
          );
        }
        setArtifact("electron-build", output);
        return {
          folder: output,
          binary: join(output, binName),
        };
      } else {
        const output = join(cwd, "out", "make");
        if (action !== "preview" && !existsSync(output)) {
          throw new Error("Electron Forge completed without producing the expected make output");
        }
        setOutput?.("output", output);
        setArtifact("electron-build", output);
        return {
          folder: output,
          binary: undefined,
        };
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "RequestError") {
          log("Request error");
        }
        if (e.name === "RequestError") {
          log("Request error");
        }
      }
      if (e === dependencyInstallError) {
        log("Electron build stopped after dependency installation failed");
      } else {
        log(e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
      }
      throw e;
    }
  } finally {
    const originalNoAsar = process.noAsar;
    process.noAsar = true;
    try {
      await rm(destinationFolder, { recursive: true, force: true });
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log("Failed to clean up staging directory:", message);
    } finally {
      try {
        if (packageTemporaryFolder) {
          await rm(packageTemporaryFolder, { recursive: true, force: true });
        }
      } catch (e) {
        const message = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        log("Failed to clean up Electron packaging temporary directory:", message);
      } finally {
        process.noAsar = originalNoAsar;
      }
    }
  }
};
