import { access, mkdir, realpath, writeFile, mkdtemp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { readdirSync, copyFileSync, statSync } from "node:fs";

export const ensure = async (filesPath: string, defaultContent = "{}") => {
  // create parent folder
  await mkdir(dirname(filesPath), {
    recursive: true,
  });

  // ensure file exist
  try {
    await access(filesPath);
  } catch {
    // File doesn't exist, create it
    await writeFile(filesPath, defaultContent); // json
  }
};

export const generateTempFolder = async (base?: string) => {
  const targetBase = base || tmpdir();
  await mkdir(targetBase, {
    recursive: true,
  });
  const realPath = await realpath(targetBase);
  console.log("join", join(realPath, "pipelab-"));
  const tempFolder = await mkdtemp(join(realPath, "pipelab-"));

  return tempFolder;
};

/**
 * A pkg-compatible recursive copy function.
 * Node's fs.cp uses opendir internally which is not supported by pkg's snapshot filesystem.
 */
export const copyRecursive = async (
  src: string,
  dest: string,
  options?: { filter?: (src: string) => boolean },
) => {
  const stats = statSync(src);
  if (options?.filter && !options.filter(src)) return;

  if (stats.isDirectory()) {
    await mkdir(dest, { recursive: true });
    const files = readdirSync(src);
    for (const file of files) {
      await copyRecursive(join(src, file), join(dest, file), options);
    }
  } else {
    copyFileSync(src, dest);
  }
};
