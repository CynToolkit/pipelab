import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonFileMissingError extends Error {
  constructor(public readonly filePath: string) {
    super(`JSON file not found: ${filePath}`);
    this.name = "JsonFileMissingError";
  }
}

export const readJsonFile = async (filePath: string): Promise<unknown> => {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new JsonFileMissingError(filePath);
    throw error;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Malformed JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const writeJsonFileAtomically = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch((): void => undefined);
  }
};

export const writeJsonFileAtomicallyIfMissing = async (
  filePath: string,
  value: unknown,
): Promise<boolean> => {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await link(temporaryPath, filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch((): void => undefined);
  }
};
