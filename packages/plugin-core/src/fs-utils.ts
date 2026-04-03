import { access, mkdir, realpath, writeFile, mkdtemp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

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
