import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const username = process.env.CONSTRUCT_CI_USERNAME;
const password = process.env.CONSTRUCT_CI_PASSWORD;
const userDataDirectory = process.env.CONSTRUCT_CI_PROFILE_USER_DATA;
const githubEnv = process.env.GITHUB_ENV;

if (!username || !password || !userDataDirectory || !githubEnv) {
  throw new Error("Construct CI credentials and a disposable profile path are required.");
}

await mkdir(userDataDirectory, { recursive: true });

const form = new FormData();
form.append("username", username);
form.append("password", password);
form.append("productType", "games");

const response = await fetch("https://account.construct.net/login.json", {
  method: "POST",
  body: form,
});
if (!response.ok) throw new Error(`Construct login request failed with HTTP ${response.status}.`);

const result = await response.json();
const login = result?.request?.status === "ok" ? result.response : undefined;
if (
  (typeof login?.userID !== "string" && typeof login?.userID !== "number") ||
  typeof login?.token !== "string"
) {
  throw new Error("Construct rejected the CI test account credentials.");
}

const context = await chromium.launchPersistentContext(userDataDirectory, { headless: true });
try {
  const page = await context.newPage();
  await page.goto("https://editor.construct.net/", { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof localforage !== "undefined", { timeout: 30_000 });
  await page.evaluate(async (value) => {
    await localforage.setItem("login-data", value);
  }, login);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    async (expectedUserId) => {
      const store = globalThis.localforage;
      if (!store) return false;
      return (await store.getItem("login-data"))?.userID === expectedUserId;
    },
    login.userID,
    { timeout: 30_000 },
  );
} finally {
  await context.close();
}

const profile = join(userDataDirectory, "Default");
await appendFile(githubEnv, `CONSTRUCT_CI_PROFILE_PATH=${profile}\n`);
console.log("Created disposable authenticated Construct profile.");
