import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PipelabContext } from "@pipelab/plugin-core";
import type { PreflightContext, PreflightResult } from "@pipelab/shared";
import { failed, unverifiable, verified } from "../preflight";

export interface SteamPreflightServices {
  context: PipelabContext;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Directories where SteamCMD keeps `config/config.vdf`, which records logged-in accounts. */
const steamConfigCandidates = (context: PipelabContext): string[] => [
  join(context.getThirdPartyPath("steamcmd", process.platform), "config", "config.vdf"),
  join(homedir(), ".steam", "steam", "config", "config.vdf"),
  join(homedir(), ".local", "share", "Steam", "config", "config.vdf"),
  join(homedir(), "Steam", "config", "config.vdf"),
  join(homedir(), "Library", "Application Support", "Steam", "config", "config.vdf"),
];

const accountsBlock = (vdf: string): string => {
  const start = vdf.search(/"Accounts"\s*\{/);
  if (start < 0) return "";
  let depth = 0;
  for (let index = vdf.indexOf("{", start); index < vdf.length; index++) {
    if (vdf[index] === "{") depth++;
    if (vdf[index] === "}" && --depth === 0) return vdf.slice(start, index);
  }
  return vdf.slice(start);
};

/**
 * Looks only at SteamCMD's saved login cache. It never starts SteamCMD or
 * logs in, so there is no Steam Guard prompt and no session invalidation.
 */
export const checkSteamPreflight = async ({
  inputs,
  connectionValues,
  services,
}: PreflightContext<SteamPreflightServices>): Promise<PreflightResult> => {
  const alias = String(inputs.accountConnectionId || "").trim();
  const username = String(connectionValues[alias]?.username || "").trim();
  if (!username) return failed("The Steam account connection has no username.");

  const configs: string[] = [];
  for (const path of steamConfigCandidates(services.context)) {
    if (!(await exists(path))) continue;
    try {
      configs.push(await readFile(path, "utf8"));
    } catch {
      // An unreadable cache says nothing about the login.
    }
  }
  if (!configs.length) return unverifiable("No SteamCMD login cache was found to inspect.");

  const wanted = username.toLowerCase();
  const loggedIn = configs.some((vdf) =>
    [...accountsBlock(vdf).matchAll(/"([^"]+)"\s*\{/g)].some(
      (match) => match[1] !== "Accounts" && match[1].toLowerCase() === wanted,
    ),
  );
  return loggedIn
    ? verified()
    : failed(
        `SteamCMD is not logged in as '${username}'. Run \`pipelab settings integrations steam login\` in an interactive terminal, then rerun this workflow.`,
      );
};
