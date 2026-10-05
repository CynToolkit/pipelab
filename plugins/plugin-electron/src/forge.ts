import { getBinName, outFolderName } from "@pipelab/constants";
import { detectRuntime, runPnpm, runWithLiveLogs, resolveBundledAsset } from "@pipelab/plugin-core";

import { dirname, join, basename, delimiter } from "node:path";
import { cp, readFile, writeFile, rm, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { platform as osPlatform, arch as osArch } from "node:os";
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
    await detectRuntime(appFolder);
  }

  const { node } = paths;
  const destinationFolder = await context.createTempFolder("electron-forge-");
  log(`Staging build in ${destinationFolder}`);

  try {
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

    const rawAssetFolder = await resolveBundledAsset("@pipelab/asset-electron");
    const templateFolder = join(rawAssetFolder, "template");
    console.log("templateFolder", templateFolder);
    console.log("destinationFolder", destinationFolder);

    // copy template to destination
    await cp(templateFolder, destinationFolder, {
      recursive: true,
      filter: (src) => {
        return basename(src) !== "node_modules";
      },
    });

    console.log("copy done");

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
    const isCJSOnly =
      hasElectronVersion &&
      semver.lt(semver.coerce(completeConfiguration.electronVersion) || "0.0.0", "28.0.0");

    const pkgJSON = JSON.parse(pkgJSONContent);
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

    if (isCJSOnly) {
      log("Setting type to", "commonjs");
      pkgJSON.type = "commonjs";
    } else {
      log("Setting type to", "module");
      pkgJSON.type = "module";
    }

    await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2));

    log("Installing packages");
    const { all: installAll } = await runPnpm(destinationFolder, {
      args: ["install", "--prefer-offline"],
      signal: abortSignal,
      context,
    });
    if (installAll) log(installAll);

    console.log("done install");

    // install user-defined custom packages
    if (
      Array.isArray(completeConfiguration.customPackages) &&
      completeConfiguration.customPackages.length > 0
    ) {
      log(`Installing custom packages: ${completeConfiguration.customPackages.join(", ")}`);
      const { all: customAll } = await runPnpm(destinationFolder, {
        args: ["install", ...completeConfiguration.customPackages, "--prefer-offline"],
        signal: abortSignal,
        context,
      });
      if (customAll) log(customAll);
    }

    // override electron version
    if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== "") {
      log(`Installing electron@${completeConfiguration.electronVersion}`);
      const { all: electronAll } = await runPnpm(destinationFolder, {
        args: ["install", `electron@${completeConfiguration.electronVersion}`, "--prefer-offline"],
        signal: abortSignal,
        context,
      });
      if (electronAll) log(electronAll);
    }

    if (isCJSOnly) {
      log(`Installing execa@8`);
      const { all: execaAll } = await runPnpm(destinationFolder, {
        args: ["install", `execa@8`, "--prefer-offline"],
        signal: abortSignal,
        context,
      });
      if (execaAll) log(execaAll);
    }

    console.log("completeConfiguration.icon", completeConfiguration.icon);

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
      const { all: esbuildAll } = await runPnpm(destinationFolder, {
        args: ["install", "-D", "esbuild@0.24.0", "--prefer-offline"],
        signal: abortSignal,
        context,
      });
      if (esbuildAll) log(esbuildAll);

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
      log(e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
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
      process.noAsar = originalNoAsar;
    }
  }
};
