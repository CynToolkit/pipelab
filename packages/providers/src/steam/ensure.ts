import { join } from "node:path";
import { access, chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import {
  downloadFile,
  extractTarGz,
  extractZip,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import type { PipelabContext } from "@pipelab/plugin-core";

const steamCmdInstallers = {
  win32: {
    url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip",
    archive: "zip",
    launcher: "steamcmd.exe",
  },
  linux: {
    url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz",
    archive: "tar.gz",
    launcher: "steamcmd.sh",
  },
  darwin: {
    url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz",
    archive: "tar.gz",
    launcher: "steamcmd.sh",
  },
} as const;

type SupportedPlatform = keyof typeof steamCmdInstallers;

export const ensureSteamCmd = async (
  context: PipelabContext,
  log: typeof console.log,
  abortSignal?: AbortSignal,
) => {
  const installer = steamCmdInstallers[process.platform as SupportedPlatform];
  if (!installer) throw new Error(`Steam uploads are not supported on ${process.platform}`);
  if (process.platform === "linux" && process.arch !== "x64")
    throw new Error("Steam uploads currently require an x64 Linux host");
  if (process.platform === "darwin" && process.arch === "arm64") {
    try {
      await runWithLiveLogs(
        "/usr/bin/arch",
        ["-x86_64", "/usr/bin/true"],
        { shell: false },
        () => {},
        undefined,
        abortSignal,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error("Steam uploads on Apple Silicon require Rosetta 2 to be installed");
    }
  }

  const installDir = context.getThirdPartyPath("steamcmd", process.platform);
  const launcherPath = join(installDir, installer.launcher);
  try {
    await access(launcherPath, constants.X_OK);
    return launcherPath;
  } catch {
    // Install below.
  }

  const parentDir = context.getThirdPartyPath("steamcmd");
  await mkdir(parentDir, { recursive: true });
  const tempDir = await mkdtemp(join(parentDir, `.setup-${process.platform}-`));
  const archivePath = join(tempDir, installer.archive === "zip" ? "steamcmd.zip" : "steamcmd.tar.gz");
  try {
    log(`Downloading SteamCMD for ${process.platform}...`);
    await downloadFile(installer.url, archivePath, undefined, abortSignal);
    if (installer.archive === "zip") await extractZip(archivePath, tempDir);
    else await extractTarGz(archivePath, tempDir);

    await access(join(tempDir, installer.launcher), constants.F_OK);
    if (process.platform !== "win32") {
      await chmod(join(tempDir, installer.launcher), 0o755);
      if (process.platform === "linux") {
        await chmod(join(tempDir, "linux32", "steamcmd"), 0o755);
        await chmod(join(tempDir, "linux32", "steamerrorreporter"), 0o755);
      } else {
        await chmod(join(tempDir, "steamcmd"), 0o755);
      }
    }

    log("Bootstrapping SteamCMD...");
    await runWithLiveLogs(
      join(tempDir, installer.launcher),
      ["+quit"],
      { cwd: tempDir, shell: false },
      log,
      { onStdout: (data) => log("[steamcmd]", data), onStderr: (data) => log("[steamcmd]", data) },
      abortSignal,
    );

    await rm(installDir, { recursive: true, force: true });
    await rename(tempDir, installDir);
    return launcherPath;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    if (error instanceof Error && error.name === "AbortError") throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to install SteamCMD: ${message}`);
  }
};
