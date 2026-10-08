const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5185";
const supabaseUrl = process.env.SUPABASE_URL;
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const expectEmailConfirmation = process.env.EXPECT_EMAIL_CONFIRMATION === "1";
const expectPasswordReset = process.env.EXPECT_PASSWORD_RESET === "1";
const expectPlanFailureUi = process.env.EXPECT_PLAN_FAILURE_UI === "1";
const expectPortalFailureUi = process.env.EXPECT_PORTAL_FAILURE_UI === "1";
const mailpitUrl = process.env.MAILPIT_URL;

assert.ok(
  !(expectPlanFailureUi && expectPortalFailureUi),
  "Run plan-failure and portal-failure UI checks separately.",
);

if (!supabaseUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(supabaseUrl).hostname)) {
  throw new Error("This smoke test only supports a local Supabase URL.");
}

const isLocalUrl = (value) => ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);

const readMailpitMessages = async () => {
  assert.ok(mailpitUrl, "MAILPIT_URL is required for local email journeys.");
  assert.ok(isLocalUrl(mailpitUrl), "This smoke test only supports a local Mailpit URL.");
  const response = await fetch(new URL("/api/v1/messages?limit=100", mailpitUrl));
  assert.ok(response.ok, "Could not read messages from local Mailpit.");
  const result = await response.json();
  const messages = Array.isArray(result) ? result : result.messages;
  assert.ok(Array.isArray(messages), "Local Mailpit returned an unexpected message list.");
  return messages;
};

const getEmailLink = async (email, excludedIds = new Set()) => {
  let message;
  for (let attempt = 0; attempt < 40 && !message; attempt++) {
    const messages = await readMailpitMessages();
    message = messages.find(
      (candidate) => !excludedIds.has(candidate.ID) && JSON.stringify(candidate).includes(email),
    );
    if (!message) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert.ok(message, "The expected account email did not arrive in local Mailpit.");
  const response = await fetch(new URL(`/view/${message.ID}.html`, mailpitUrl));
  assert.ok(response.ok, "Could not read the account email from local Mailpit.");
  const html = await response.text();
  const url = [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .find((href) => href.includes("/auth/v1/verify?"));
  assert.ok(url, "The account email did not contain a verification link.");
  assert.ok(isLocalUrl(url), "The account verification link must point to local Supabase.");
  return url;
};

let stage = "launch browser";
let failureContext = "";

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
  const callbackNavigations = [];

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
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = new URL(frame.url());
    if (url.pathname === "/auth/callback") {
      callbackNavigations.push({
        queryKeys: [...url.searchParams.keys()],
        type: url.searchParams.get("type"),
        hashKeys: [...new URLSearchParams(url.hash.slice(1)).keys()],
      });
    }
  });
  if (expectPlanFailureUi || expectPortalFailureUi) {
    const corsHeaders = {
      "access-control-allow-origin": new URL(baseUrl).origin,
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    await page.route("**/functions/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path !== "/functions/v1/polar-user-plan" && path !== "/functions/v1/customer-portal") {
        return route.continue();
      }
      if (request.method() === "OPTIONS") {
        return route.fulfill({ status: 200, headers: corsHeaders });
      }
      if (path === "/functions/v1/polar-user-plan" && expectPlanFailureUi) {
        return route.fulfill({
          status: 500,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ message: "Plan lookup unavailable for this test." }),
        });
      }
      if (path === "/functions/v1/polar-user-plan" && expectPortalFailureUi) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({
            subscriptions: [
              {
                id: "test-subscription",
                status: "active",
                product: { id: "browser-test-plan", name: "Browser test plan", benefits: [] },
                amount: 1000,
                currency: "usd",
                recurringInterval: "month",
              },
            ],
          }),
        });
      }
      if (path === "/functions/v1/customer-portal" && expectPortalFailureUi) {
        return route.fulfill({
          status: 500,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ message: "Portal unavailable for this test." }),
        });
      }
      return route.continue();
    });
  }
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
      await page.goto(await getEmailLink(email), { waitUntil: "domcontentloaded" });
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

    if (expectPlanFailureUi) {
      stage = "show subscription lookup failure in billing settings";
      await page.getByRole("button", { name: "Settings" }).click();
      await page.locator(".settings-sidebar .sidebar-item").filter({ hasText: "Billing" }).click();
      await page.getByText("Unable to check your plan.", { exact: true }).waitFor();
      const planError = page.locator(".settings-panel [role='alert']");
      await planError.waitFor();
      assert.ok((await planError.innerText()).trim(), "billing shows the plan lookup error");

      stage = "retry subscription lookup from billing settings";
      const retriedPlanLookup = page.waitForResponse(
        (response) =>
          response.status() === 500 &&
          new URL(response.url()).pathname === "/functions/v1/polar-user-plan",
      );
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await retriedPlanLookup;
    }

    if (expectPortalFailureUi) {
      stage = "show customer portal launch failure in billing settings";
      await page.getByRole("button", { name: "Settings" }).click();
      await page.locator(".settings-sidebar .sidebar-item").filter({ hasText: "Billing" }).click();
      await page.getByText("Browser test plan", { exact: true }).waitFor();
      const portalFailure = page.waitForResponse(
        (response) =>
          response.status() === 500 &&
          new URL(response.url()).pathname === "/functions/v1/customer-portal",
      );
      await page.locator(".manage-portal-btn").click();
      await portalFailure;
      await page
        .getByRole("alert")
        .filter({ hasText: "Unable to open the billing portal. Please try again." })
        .waitFor();
    }

    if (expectPasswordReset) {
      const previousMessages = new Set((await readMailpitMessages()).map((message) => message.ID));
      stage = "open forgot password form";
      await page.locator(".account-logout-btn").click();
      await page.getByRole("button", { name: "Login / Register" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Login / Register" }).click();
      await page.getByRole("button", { name: "Forgot password?" }).click();
      await page.locator("#email-reset").fill(email);
      stage = "request password reset email";
      await page.getByRole("button", { name: "Send Reset Link" }).click();
      stage = "receive local password reset email";
      await page.goto(await getEmailLink(email, previousMessages), {
        waitUntil: "domcontentloaded",
      });
      stage = "open password recovery callback";
      await page.getByRole("heading", { name: "Reset your password" }).waitFor({ timeout: 15000 });
      await page.locator("#new-password input").fill("Pipelab-Updated1!");
      await page.locator("#confirm-password input").fill("Pipelab-Updated1!");
      stage = "save recovered password";
      await page.getByRole("button", { name: "Update password" }).click();
      await page.getByRole("heading", { name: "Password updated" }).waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
      await page.locator(".account-logout-btn").click();
      await page.getByRole("button", { name: "Login / Register" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Login / Register" }).click();
      await page.locator("#email").fill(email);
      await page.locator("#password input").fill("Pipelab-Updated1!");
      stage = "sign in with recovered password";
      await page.locator('button[type="submit"]').click();
      await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    }

    assert.deepEqual(appSockets, [], `hosted auth opened app WebSockets: ${appSockets.join(", ")}`);
    assert.deepEqual(pageErrors, [], `browser had page errors: ${pageErrors.join("; ")}`);
    assert.deepEqual(consoleErrors, [], `browser had console errors: ${consoleErrors.join("; ")}`);
    assert.ok(
      failedResponses.every(({ status, path }) => {
        if (expectPlanFailureUi) return status === 500 && path === "/functions/v1/polar-user-plan";
        if (expectPortalFailureUi)
          return status === 500 && path === "/functions/v1/customer-portal";
        return status === 404 && path === "/functions/v1/polar-user-plan";
      }),
      `local auth journey had unexpected HTTP failures: ${JSON.stringify(failedResponses)}`,
    );
    console.log(
      `Local hosted auth passed: signup${expectEmailConfirmation ? ", email verification" : ""}${expectPasswordReset ? ", password reset" : ""}, refresh restore, sign-out, sign-in, no agent socket. Unavailable local plan function responses: ${failedResponses.length}.`,
    );
  } catch (error) {
    const path = new URL(page.url()).pathname;
    const callbackText = await page
      .locator(".auth-callback")
      .innerText()
      .catch(() => "");
    const failures = failedResponses.map(({ status, path }) => `${status} ${path}`).join(", ");
    const callback = callbackNavigations.length ? JSON.stringify(callbackNavigations) : "";
    failureContext = [path, callbackText, callback, failures].filter(Boolean).join(" — ");
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message
    .replace(/([?&]code=)[^&\s]*/g, "$1[redacted]")
    .replace(/hosted-auth-[^@\s]+@example\.test/g, "[test email]");
  console.error(
    `Local hosted auth failed during ${stage}${failureContext ? ` (${failureContext})` : ""}: ${safeMessage}`,
  );
  process.exitCode = 1;
});
