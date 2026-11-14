import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runWithLiveLogs, type PipelabContext } from "@pipelab/plugin-core";
import type { ConnectionTestContext, PreflightContext, PreflightResult } from "@pipelab/shared";
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

const steamLoginState = async (
  username: string,
  context: PipelabContext,
): Promise<"logged-in" | "logged-out" | "no-cache"> => {
  const configs: string[] = [];
  for (const path of steamConfigCandidates(context)) {
    if (!(await exists(path))) continue;
    try {
      configs.push(await readFile(path, "utf8"));
    } catch {
      // An unreadable cache says nothing about the login.
    }
  }
  if (!configs.length) return "no-cache";
  const wanted = username.toLowerCase();
  return configs.some((vdf) =>
    [...accountsBlock(vdf).matchAll(/"([^"]+)"\s*\{/g)].some(
      (match) => match[1] !== "Accounts" && match[1].toLowerCase() === wanted,
    ),
  )
    ? "logged-in"
    : "logged-out";
};

const notLoggedInMessage = (username: string) =>
  `SteamCMD is not logged in as '${username}'. Run \`pipelab settings integrations steam login\` in an interactive terminal, then rerun this workflow.`;

/**
 * The one Steam account check, used by the run preflight and by the Connections test. It looks only
 * at SteamCMD's saved login cache: it never starts SteamCMD or logs in, so there is no Steam Guard
 * prompt and no session invalidation. A missing login fails a run's preflight, but only
 * "cannot verify" when testing a connection, since the login can follow saving it.
 */
export const verifySteamAccount = async (
  username: string,
  context: PipelabContext,
  loginMissing: "failed" | "unverifiable",
): Promise<PreflightResult> => {
  if (!username) return failed("The Steam account connection has no username.");
  const state = await steamLoginState(username, context);
  if (state === "no-cache") return unverifiable("No SteamCMD login cache was found to inspect.");
  if (state === "logged-in") return verified();
  return loginMissing === "failed"
    ? failed(notLoggedInMessage(username))
    : unverifiable(notLoggedInMessage(username));
};

/** Depot IDs listed under an app in `app_info_print` output; undefined when Steam shows no such app. */
export const parseSteamAppDepots = (output: string, appId: string): string[] | undefined => {
  const header = output.indexOf(`AppID : ${appId},`);
  if (header < 0) return undefined;
  const block = output.slice(header);
  // An app the account cannot see comes back as an empty block.
  if (!/"common"\s*\{/.test(block)) return undefined;
  const start = block.search(/"depots"\s*\{/);
  if (start < 0) return [];
  const depots: string[] = [];
  let depth = 0;
  for (let index = block.indexOf("{", start); index < block.length; index++) {
    if (block[index] === "{") depth++;
    else if (block[index] === "}" && --depth === 0) break;
    else if (depth === 1 && block[index] === '"') {
      const end = block.indexOf('"', index + 1);
      const key = block.slice(index + 1, end);
      if (/^\d+$/.test(key) && /^\s*\{/.test(block.slice(end + 1))) depots.push(key);
      index = end;
    }
  }
  return depots;
};

const STEAM_APP_LOOKUP_TIMEOUT_MS = 30_000;
const appLookups = new Map<string, Promise<string[] | undefined | "unavailable">>();

/**
 * Asks Steam, through SteamCMD's saved login, which depots the account sees for an app. Steam shows
 * nothing for an app the account has no access to. Never installs or prompts; concurrent lookups of
 * the same app share one SteamCMD run.
 */
const lookupSteamApp = (
  username: string,
  appId: string,
  context: PipelabContext,
  signal?: AbortSignal,
) => {
  const key = `${username}\0${appId}`;
  const running = appLookups.get(key);
  if (running) return running;
  const lookup = (async () => {
    const directory = context.getThirdPartyPath("steamcmd", process.platform);
    const launcher = join(directory, process.platform === "win32" ? "steamcmd.exe" : "steamcmd.sh");
    if (!(await exists(launcher))) return "unavailable" as const;
    let output = "";
    const timeout = AbortSignal.timeout(STEAM_APP_LOOKUP_TIMEOUT_MS);
    try {
      await runWithLiveLogs(
        launcher,
        [
          "+@ShutdownOnFailedCommand",
          "1",
          "+@NoPromptForPassword",
          "1",
          "+login",
          username,
          "+app_info_update",
          "1",
          "+app_info_print",
          appId,
          "+quit",
        ],
        { cwd: directory, shell: false },
        () => {},
        { onStdout: (data) => void (output += data), onStderr: () => {} },
        signal ? AbortSignal.any([signal, timeout]) : timeout,
      );
    } catch {
      return "unavailable" as const;
    }
    return parseSteamAppDepots(output, appId);
  })().finally(() => appLookups.delete(key));
  appLookups.set(key, lookup);
  return lookup;
};

export const verifySteamApp = async (
  username: string,
  appId: string,
  depotId: string,
  context: PipelabContext,
  signal?: AbortSignal,
): Promise<PreflightResult> => {
  if (!/^\d+$/.test(appId)) return verified();
  const depots = await lookupSteamApp(username, appId, context, signal);
  if (depots === "unavailable") return unverifiable("SteamCMD could not look up the app.");
  if (!depots) {
    return failed(
      `Steam shows no App ID ${appId} for '${username}'. Check the App ID, and that this account is on the app's Steamworks team.`,
    );
  }
  if (/^\d+$/.test(depotId) && !depots.includes(depotId)) {
    return failed(
      `Depot ${depotId} is not one of App ${appId}'s depots (${depots.join(", ") || "none"}).`,
    );
  }
  return verified();
};

export const checkSteamPreflight = async ({
  inputs,
  connectionValues,
  services,
  signal,
}: PreflightContext<SteamPreflightServices>): Promise<PreflightResult> => {
  const alias = String(inputs.accountConnectionId || "").trim();
  const username = String(connectionValues[alias]?.username || "").trim();
  const account = await verifySteamAccount(username, services.context, "failed");
  if (account.status !== "verified") return account;
  return verifySteamApp(
    username,
    String(inputs.appId ?? "").trim(),
    String(inputs.depotId ?? "").trim(),
    services.context,
    signal,
  );
};

export const testSteamConnection = async ({
  values,
  services,
}: ConnectionTestContext<SteamPreflightServices>): Promise<PreflightResult> =>
  verifySteamAccount(String(values.username || "").trim(), services.context, "unverifiable");
