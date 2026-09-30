import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { PipelabContext } from "@pipelab/plugin-core";
import { ensureSteamCmd } from "./ensure";

/** Authenticate SteamCMD and let it save the login cache used by Steam uploads. */
export const loginToSteam = async (context: PipelabContext, username: string): Promise<void> => {
  const accountName = username.trim();
  if (!accountName) throw new Error("A Steam username is required.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Steam login needs an interactive terminal for your password and Steam Guard code.",
    );
  }

  const steamCmdPath = await ensureSteamCmd(context, (message) => console.log(message));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      steamCmdPath,
      ["+@ShutdownOnFailedCommand", "1", "+login", accountName, "+quit"],
      { cwd: dirname(steamCmdPath), shell: false, stdio: "inherit" },
    );
    child.once("error", (error) => reject(new Error(`Could not start SteamCMD: ${error.message}`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`SteamCMD login failed${code === null ? "" : ` (exit code ${code})`}.`));
    });
  });
};
