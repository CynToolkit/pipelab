#!/usr/bin/env node
// Seeds a dedicated, signed-in Chromium profile for Construct exports.
//
// Credentials (never printed), first match wins:
//   CONSTRUCT_USERNAME / CONSTRUCT_PASSWORD
//   CONSTRUCT_CI_USERNAME / CONSTRUCT_CI_PASSWORD
// Optional: CONSTRUCT_PROFILE_USER_DATA (default ~/.config/chromium/PipelabConstruct)

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT = "https://account.construct.net";

const fail = (message) => {
  console.error(`construct-profile: ${message}`);
  process.exit(1);
};

const username = process.env.CONSTRUCT_USERNAME || process.env.CONSTRUCT_CI_USERNAME;
const password = process.env.CONSTRUCT_PASSWORD || process.env.CONSTRUCT_CI_PASSWORD;
if (!username || !password) {
  fail("set CONSTRUCT_USERNAME and CONSTRUCT_PASSWORD (e.g. run through `doppler run --`).");
}

const userDataDir =
  process.env.CONSTRUCT_PROFILE_USER_DATA ||
  join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "chromium", "PipelabConstruct");

// Playwright is a dependency of @pipelab/providers, not of the repository root.
const require = createRequire(new URL("../../packages/providers/package.json", import.meta.url));
const { chromium } = require("playwright");

const form = new FormData();
form.append("username", username);
form.append("password", password);
form.append("productType", "games");
const response = await fetch(`${ACCOUNT}/login.json`, { method: "POST", body: form });
if (!response.ok) fail(`Construct login request failed with HTTP ${response.status}.`);
const result = await response.json();
const login = result?.request?.status === "ok" ? result.response : undefined;
if (
  (typeof login?.userID !== "string" && typeof login?.userID !== "number") ||
  typeof login?.token !== "string"
) {
  fail("Construct rejected the credentials.");
}

mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
try {
  const page = await context.newPage();
  await page.goto(`${ACCOUNT}/login?theme=default&lang=en-US&productType=games`, {
    waitUntil: "commit",
  });
  await page.waitForFunction(() => typeof localforage !== "undefined", undefined, {
    timeout: 30_000,
  });
  await page.evaluate((value) => localforage.setItem("login-data", value), login);

  const tokenResponse = page.waitForResponse(
    (value) => {
      const url = new URL(value.url());
      return url.origin === ACCOUNT && url.pathname === "/token.json";
    },
    { timeout: 45_000 },
  );
  await page.goto("https://editor.construct.net/", { waitUntil: "commit" });
  const token = await (await tokenResponse).json();
  if (token?.request?.status !== "ok") fail("Construct did not confirm the new session.");
} finally {
  await context.close();
}

console.log("Seeded the Construct profile.");
console.log(`CONSTRUCT_PROFILE_PATH=${join(userDataDir, "Default")}`);
