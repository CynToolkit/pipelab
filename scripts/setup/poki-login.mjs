#!/usr/bin/env node
// Saves a Poki CLI login for Pipelab without needing a browser on this machine.
//
// 1. The script prints a Poki sign-in link. Open it on any device and sign in.
// 2. Poki then redirects to a http://localhost URL that will not load there;
//    copy that final URL from the address bar.
// 3. Give it to this script, by any of:
//      - the first argument:            node poki-login.mjs "<url>"
//      - the POKI_LOGIN_URL variable
//      - typing/pasting it at the prompt (interactive terminals)
//
// Without POKI_ACCOUNT the login is the standard Poki CLI one,
// <config>/poki/auth.json, which Pipelab reads in place. With POKI_ACCOUNT=name
// it is saved for that named Poki account in Pipelab's managed directory
// (<thirdparty>/poki-accounts/<name>), for workflows whose Poki Account
// connection uses that name. PIPELAB_THIRDPARTY_PATH overrides the directory
// (default ~/.config/@pipelab/app-dev/thirdparty). An existing login (for
// example from the official Poki CLI) is kept; delete that file to sign in again.
// Config root: XDG_CONFIG_HOME or ~/.config (LOCALAPPDATA on Windows).

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const CALLBACK = "http://localhost:8745";

const fail = (message) => {
  console.error(`poki-login: ${message}`);
  process.exit(1);
};

const configRoot =
  process.platform === "win32"
    ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const account = (process.env.POKI_ACCOUNT || "").trim();
if (account && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(account)) {
  fail("POKI_ACCOUNT must be 1-64 letters, numbers, dots, dashes or underscores.");
}
const thirdParty =
  process.env.PIPELAB_THIRDPARTY_PATH || join(configRoot, "@pipelab", "app-dev", "thirdparty");
const authRoot = account ? join(thirdParty, "poki-accounts", account.toLowerCase()) : configRoot;
const authDirectory = join(authRoot, process.platform === "win32" ? "Poki" : "poki");
const authPath = join(authDirectory, "auth.json");

// A login saved earlier under Pipelab's third-party directory is still honoured.
const legacyAuthPath = join(
  configRoot,
  "@pipelab",
  "app-dev",
  "thirdparty",
  process.platform === "win32" ? "Poki" : "poki",
  "auth.json",
);
const existing = (account ? [authPath] : [authPath, legacyAuthPath]).find((path) =>
  existsSync(path),
);
if (existing) {
  console.log("Poki login already saved. Delete the saved login to sign in again.");
  process.exit(0);
}

const signInUrl = `https://app.poki.dev/signin/?cli=${encodeURIComponent(CALLBACK)}`;
let input = (process.argv[2] || process.env.POKI_LOGIN_URL || "").trim();

if (!input) {
  console.log(`Open this link on any device and sign in to Poki:\n\n  ${signInUrl}\n`);
  if (!process.stdin.isTTY) {
    fail("no sign-in URL provided. Set POKI_LOGIN_URL or pass it as an argument, then rerun.");
  }
  console.log(
    "Afterwards copy the final URL from the browser address bar (it starts with " + CALLBACK + ").",
  );
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  input = (await prompt.question("Final URL: ")).trim();
  prompt.close();
}

let token;
try {
  const url = new URL(input);
  if (url.origin !== CALLBACK) throw new Error();
  token = url.searchParams.get("exchange_token");
} catch {
  fail(`expected the final ${CALLBACK}/?exchange_token=… URL from the browser.`);
}
if (!token) fail("that URL has no exchange_token.");

const response = await fetch("https://auth.poki.io/auth/exchange", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ exchange_token: token }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  fail(
    `token exchange failed (HTTP ${response.status}). The link may have expired; sign in again.`,
  );
const auth = await response.json();
if (typeof auth?.access_token !== "string") fail("Poki did not return a usable token.");

await mkdir(authDirectory, { recursive: true, mode: 0o700 });
await chmod(authDirectory, 0o700);
const tempPath = join(authDirectory, `.auth-${randomUUID()}.tmp`);
try {
  await writeFile(tempPath, JSON.stringify(auth), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(tempPath, authPath);
  await chmod(authPath, 0o600);
} catch (error) {
  await rm(tempPath, { force: true }).catch(() => {});
  throw error;
}
console.log("Saved the Poki login.");
