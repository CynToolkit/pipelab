import { Options } from "execa";

export const runWithLiveLogs = async (
  command: string,
  args: string[],
  execaOptions: Options,
  log: typeof console.log,
): Promise<void> => {
  const { execa } = await import("execa");
  return new Promise((resolve, reject) => {
    log('runWithLiveLogs', command, args, execaOptions)

    const subprocess = execa(command, args, {
      ...execaOptions,
      stdout: "pipe",
      stderr: "pipe",
    });

    subprocess.stdout.on("data", (data: Buffer) => {
      log(data.toString());
    });

    subprocess.stderr?.on("data", (data: Buffer) => {
      log(data.toString());
    });

    subprocess.on("error", (error: Error) => {
      reject(error);
    });

    subprocess.on("exit", (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with non-zero code: ${code}`));
      }
    });
  });
};
