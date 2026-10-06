import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGpupatch, gpupatchAssetName, patchExecutableWithGpupatch } from "../../gpupatch";

const mocks = vi.hoisted(() => ({ download: vi.fn(), run: vi.fn() }));
vi.mock("@pipelab/plugin-core", () => ({
  downloadFile: mocks.download,
  runWithLiveLogs: mocks.run,
  fileExists: async (path: string) =>
    access(path).then(
      () => true,
      () => false,
    ),
}));

let folder: string;
let binary: string;
const log = vi.fn();
const options = () => ({
  context: { getThirdPartyPath: (...parts: string[]) => join(folder, "thirdparty", ...parts) },
  log,
});

beforeEach(async () => {
  vi.clearAllMocks();
  folder = await mkdtemp(join(tmpdir(), "gpupatch-test-"));
  binary = join(folder, "Game.exe");
  await writeFile(binary, "original");
  mocks.download.mockImplementation(async (_url: string, path: string) => writeFile(path, "CLI"));
  mocks.run.mockImplementation(async (_command: string, args: string[]) =>
    writeFile(args[1], "patched"),
  );
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("gpupatch", () => {
  it.each([
    ["win32", "x64", "gpupatch-cli-x86_64-pc-windows-msvc.exe"],
    ["linux", "x64", "gpupatch-cli-x86_64-unknown-linux-gnu"],
    ["darwin", "x64", "gpupatch-cli-x86_64-apple-darwin"],
    ["darwin", "arm64", "gpupatch-cli-aarch64-apple-darwin"],
  ] as const)("maps %s/%s to its release asset", (platform, arch, asset) => {
    expect(gpupatchAssetName(platform, arch)).toBe(asset);
  });
  it.each([
    ["linux", "arm64"],
    ["win32", "ia32"],
    ["win32", "arm64"],
    ["freebsd", "x64"],
  ] as const)("rejects unsupported host %s/%s", (platform, arch) => {
    expect(() => gpupatchAssetName(platform, arch)).toThrow("gpupatch is not available");
  });
  it("downloads the pinned host asset atomically and reuses it", async () => {
    const executable = await ensureGpupatch(options());
    expect(mocks.download).toHaveBeenCalledWith(
      `https://github.com/CynToolkit/gpupatch/releases/download/v0.2.1/${gpupatchAssetName(process.platform, process.arch)}`,
      expect.any(String),
      undefined,
      undefined,
    );
    expect(await readFile(executable, "utf8")).toBe("CLI");
    if (process.platform !== "win32") expect((await stat(executable)).mode & 0o777).toBe(0o755);
    expect(await ensureGpupatch(options())).toBe(executable);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(await readdir(join(folder, "thirdparty", "gpupatch", "v0.2.1"))).toEqual([
      gpupatchAssetName(process.platform, process.arch),
    ]);
  });
  it("removes incomplete downloads and retries", async () => {
    mocks.download.mockImplementationOnce(async (_url: string, path: string) => {
      await writeFile(path, "partial");
      throw new Error("download failed");
    });
    await expect(ensureGpupatch(options())).rejects.toThrow("download failed");
    expect(await readdir(join(folder, "thirdparty", "gpupatch", "v0.2.1"))).toEqual([]);
    await ensureGpupatch(options());
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
  it("skips non-Windows targets before downloading", async () => {
    await patchExecutableWithGpupatch(binary, "linux", options());
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(await readFile(binary, "utf8")).toBe("original");
  });
  it("replaces a Windows executable using a separate output path", async () => {
    await patchExecutableWithGpupatch(binary, "win32", options());
    expect(mocks.run).toHaveBeenCalledWith(
      expect.any(String),
      [binary, expect.any(String)],
      { cancelSignal: undefined, shell: false },
      log,
      expect.any(Object),
    );
    expect(await readFile(binary, "utf8")).toBe("patched");
    expect((await readdir(folder)).filter((name) => name.startsWith(".gpupatch-"))).toEqual([]);
  });
  it("preserves the original and cleans temporary output when patching fails", async () => {
    mocks.run.mockImplementationOnce(async (_command: string, args: string[]) => {
      await writeFile(args[1], "partial");
      throw new Error("patch failed");
    });
    await expect(patchExecutableWithGpupatch(binary, "win32", options())).rejects.toThrow(
      "patch failed",
    );
    expect(await readFile(binary, "utf8")).toBe("original");
    expect((await readdir(folder)).filter((name) => name.startsWith(".gpupatch-"))).toEqual([]);
  });
  it("does not replace the original if the CLI produces no output", async () => {
    mocks.run.mockResolvedValueOnce(undefined);
    await expect(patchExecutableWithGpupatch(binary, "win32", options())).rejects.toThrow();
    expect(await readFile(binary, "utf8")).toBe("original");
  });
  it("propagates cancellation before downloading", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      patchExecutableWithGpupatch(binary, "win32", {
        ...options(),
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("propagates cancellation after the CLI without replacing the original", async () => {
    const controller = new AbortController();
    mocks.run.mockImplementationOnce(async (_command: string, args: string[]) => {
      await writeFile(args[1], "patched");
      controller.abort();
    });
    await expect(
      patchExecutableWithGpupatch(binary, "win32", {
        ...options(),
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(await readFile(binary, "utf8")).toBe("original");
  });
});
