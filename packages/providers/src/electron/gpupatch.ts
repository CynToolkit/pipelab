import { downloadFile, fileExists, runWithLiveLogs } from "@pipelab/plugin-core";
import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const GPUPATCH_RELEASE = "v0.2.1";

export const gpupatchAssetName = (platform: NodeJS.Platform, arch: NodeJS.Architecture): string => {
  if (platform === "darwin" && arch === "arm64") return "gpupatch-cli-aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "gpupatch-cli-x86_64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "gpupatch-cli-x86_64-unknown-linux-gnu";
  if (platform === "win32" && arch === "x64") return "gpupatch-cli-x86_64-pc-windows-msvc.exe";
  throw new Error(`gpupatch is not available for ${platform}-${arch}`);
};

type PatchOptions = {
  context: { getThirdPartyPath(...subpaths: string[]): string };
  log: typeof console.log;
  abortSignal?: AbortSignal;
};

export const ensureGpupatch = async ({
  context,
  log,
  abortSignal,
}: PatchOptions): Promise<string> => {
  abortSignal?.throwIfAborted();
  const assetName = gpupatchAssetName(process.platform, process.arch);
  const folder = context.getThirdPartyPath("gpupatch", GPUPATCH_RELEASE);
  const executable = join(folder, assetName);
  if (await fileExists(executable)) return executable;

  await mkdir(folder, { recursive: true });
  const temporaryFolder = await mkdtemp(join(folder, ".download-"));
  const downloadPath = join(temporaryFolder, assetName);
  try {
    const url = `https://github.com/CynToolkit/gpupatch/releases/download/${GPUPATCH_RELEASE}/${assetName}`;
    log("Downloading gpupatch from", url);
    await downloadFile(url, downloadPath, undefined, abortSignal);
    abortSignal?.throwIfAborted();
    if (process.platform !== "win32") await chmod(downloadPath, 0o755);
    await rename(downloadPath, executable);
    return executable;
  } finally {
    await rm(temporaryFolder, { recursive: true, force: true });
  }
};

export const patchExecutableWithGpupatch = async (
  binaryPath: string,
  targetPlatform: NodeJS.Platform,
  options: PatchOptions,
): Promise<void> => {
  if (targetPlatform !== "win32") {
    options.log("gpupatch only supports Windows executables, skipping patch");
    return;
  }
  options.abortSignal?.throwIfAborted();
  const executable = await ensureGpupatch(options);
  const temporaryFolder = await mkdtemp(join(dirname(binaryPath), ".gpupatch-"));
  const patchedPath = join(temporaryFolder, basename(binaryPath));
  try {
    options.log("Patching executable with gpupatch:", binaryPath);
    await runWithLiveLogs(
      executable,
      [binaryPath, patchedPath],
      { cancelSignal: options.abortSignal, shell: false },
      options.log,
      {
        onStderr: (data) => options.log(data),
        onStdout: (data) => options.log(data),
      },
    );
    options.abortSignal?.throwIfAborted();
    await rename(patchedPath, binaryPath);
    options.log("Patched executable with gpupatch");
  } finally {
    await rm(temporaryFolder, { recursive: true, force: true });
  }
};
