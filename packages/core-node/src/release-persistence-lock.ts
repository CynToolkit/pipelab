import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const mutationTails = new Map<string, Promise<void>>();

type LockOwner = { pid: number; token: string };
const isLockOwner = (owner: LockOwner | undefined): owner is LockOwner =>
  Boolean(owner && Number.isInteger(owner.pid) && owner.pid > 0 && typeof owner.token === "string");

const processIsAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Project-index transactions and per-pipeline history updates run in more than one CLI/backend
// process, so the in-memory queue is paired with an exclusive lockfile for the full transaction.
const withFileLock = async <T>(key: string, mutation: () => Promise<T>): Promise<T> => {
  const lockPath = `${key}.lock`;
  const token = randomUUID();
  const waitStartedAt = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const lockFile = await open(lockPath, "wx", 0o600);
      try {
        await lockFile.writeFile(JSON.stringify({ pid: process.pid, token } satisfies LockOwner));
      } catch (error) {
        await lockFile.close();
        await rm(lockPath, { force: true });
        throw error;
      }
      await lockFile.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let owner: LockOwner | undefined;
      try {
        owner = JSON.parse(await readFile(lockPath, "utf8")) as LockOwner;
      } catch {
        // A crashed writer may have left a partially-written lock file.
      }
      if (isLockOwner(owner)) {
        if (processIsAlive(owner.pid)) {
          if (Date.now() - waitStartedAt > 60_000)
            throw new Error(
              `Timed out waiting for persistence lock '${lockPath}' held by process ${owner.pid}.`,
            );
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
      }
      let lockStat;
      try {
        lockStat = await stat(lockPath);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (!isLockOwner(owner) && Date.now() - lockStat.mtimeMs < 30_000) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      throw new Error(
        `Stale persistence lock '${lockPath}'${isLockOwner(owner) ? ` from process ${owner.pid}` : " with incomplete owner data"}. Verify no Pipelab writer is active, then remove the lock file to resume persistence.`,
      );
    }
  }

  const release = async () => {
    try {
      const owner = JSON.parse(await readFile(lockPath, "utf8")) as LockOwner;
      if (owner.token === token) await rm(lockPath, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
  let result: T;
  try {
    result = await mutation();
  } catch (error) {
    await release().catch((): void => undefined);
    throw error;
  }
  await release();
  return result;
};

export const serializeFileMutation = async <T>(
  key: string,
  mutation: () => Promise<T>,
): Promise<T> => {
  const previous = mutationTails.get(key) || Promise.resolve();
  const current = previous.catch((): void => undefined).then(() => withFileLock(key, mutation));
  const tail = current.then(
    (): void => undefined,
    (): void => undefined,
  );
  mutationTails.set(key, tail);
  try {
    return await current;
  } finally {
    if (mutationTails.get(key) === tail) mutationTails.delete(key);
  }
};
