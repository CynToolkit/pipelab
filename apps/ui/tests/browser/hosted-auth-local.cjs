const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5185";
const supabaseUrl = process.env.SUPABASE_URL;
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const expectEmailConfirmation = process.env.EXPECT_EMAIL_CONFIRMATION === "1";
const mailpitUrl = process.env.MAILPIT_URL;

if (!supabaseUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(supabaseUrl).hostname)) {
  throw new Error("This smoke test only supports a local Supabase URL.");
}

const isLocalUrl = (value) => ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);

const getConfirmationUrl = async (email) => {
  assert.ok(mailpitUrl, "MAILPIT_URL is required when email confirmation is enabled.");
  assert.ok(isLocalUrl(mailpitUrl), "This smoke test only supports a local Mailpit URL.");

  let message;
  for (let attempt = 0; attempt < 40 && !message; attempt++) {
    const response = await fetch(new URL("/api/v1/messages?limit=40", mailpitUrl));
    assert.ok(response.ok, "Could not read messages from local Mailpit.");
    const result = await response.json();
    const messages = Array.isArray(result) ? result : result.messages;
    assert.ok(Array.isArray(messages), "Local Mailpit returned an unexpected message list.");
    message = messages.find((candidate) => JSON.stringify(candidate).includes(email));
    if (!message) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert.ok(message, "The signup confirmation email did not arrive in local Mailpit.");
  const response = await fetch(new URL(`/view/${message.ID}.html`, mailpitUrl));
  assert.ok(response.ok, "Could not read the signup confirmation email from local Mailpit.");
  const html = await response.text();
  const url = [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .find((href) => href.includes("/auth/v1/verify?"));
  assert.ok(url, "The signup confirmation email did not contain a verification link.");
  assert.ok(isLocalUrl(url), "The signup confirmation link must point to local Supabase.");
  return url;
};

let stage = "launch browser";

(async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  const appSockets = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url.endsWith("/favicon.ico") &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
    }
  });
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).searchParams.has("token")) appSockets.push(socket.url());
  });
  try {
    const email = `hosted-auth-${Date.now()}@example.test`;
    const password = "Pipelab-Test1!";

    stage = "open hosted dashboard";
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("Hosted mode is ready.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Login / Register" }).click();
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.locator("#email-reg").fill(email);
    await page.locator("#password-reg input").fill(password);
    await page.locator("#confirmPassword input").fill(password);
    stage = "submit signup";
    await page.locator('button[type="submit"]').click();

    if (expectEmailConfirmation) {
      stage = "wait for confirmation notice";
      await page.getByText("A confirmation e-mail has been sent").waitFor({ timeout: 15000 });
      stage = "confirm signup from local Mailpit";
      await page.goto(await getConfirmationUrl(email), { waitUntil: "domcontentloaded" });
      stage = "verify email confirmation callback";
      await page.getByRole("heading", { name: "Email verified" }).waitFor({ timeout: 15000 });
      stage = "continue to signed-in dashboard";
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    } else {
      stage = "wait for signed-in account";
      await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    }

    stage = "restore session after refresh";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    stage = "sign out";
    await page.locator(".account-logout-btn").click();
    await page.getByRole("button", { name: "Login / Register" }).waitFor({ timeout: 10000 });
    stage = "sign in again";
    await page.getByRole("button", { name: "Login / Register" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password input").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });

    assert.deepEqual(appSockets, [], `hosted auth opened app WebSockets: ${appSockets.join(", ")}`);
    assert.deepEqual(pageErrors, [], `browser had page errors: ${pageErrors.join("; ")}`);
    assert.deepEqual(consoleErrors, [], `browser had console errors: ${consoleErrors.join("; ")}`);
    assert.ok(
      failedResponses.every(
        ({ status, path }) => status === 404 && path === "/functions/v1/polar-user-plan",
      ),
      `local auth journey had unexpected HTTP failures: ${JSON.stringify(failedResponses)}`,
    );
    console.log(
      `Local hosted auth passed: signup${expectEmailConfirmation ? ", email verification" : ""}, refresh restore, sign-out, sign-in, no agent socket. Unavailable local plan function responses: ${failedResponses.length}.`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message
    .replace(/([?&]code=)[^&\s]*/g, "$1[redacted]")
    .replace(/hosted-auth-[^@\s]+@example\.test/g, "[test email]");
  console.error(`Local hosted auth failed during ${stage}: ${safeMessage}`);
  process.exitCode = 1;
});
