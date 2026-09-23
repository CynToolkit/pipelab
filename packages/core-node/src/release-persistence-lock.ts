import lockfile from "proper-lockfile";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const lockOptions = {
  realpath: false,
  retries: { retries: 10, minTimeout: 25, maxTimeout: 250 },
  stale: 30_000,
  update: 10_000,
};

export const serializeFileMutation = async <T>(
  key: string,
  mutation: () => Promise<T>,
): Promise<T> => {
  await mkdir(dirname(key), { recursive: true });
  const release = await lockfile.lock(key, lockOptions);
  try {
    return await mutation();
  } finally {
    await release();
  }
};
