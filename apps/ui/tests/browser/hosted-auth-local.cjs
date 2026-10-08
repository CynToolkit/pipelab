const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5185";
const supabaseUrl = process.env.SUPABASE_URL;
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

if (!supabaseUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(supabaseUrl).hostname)) {
  throw new Error("This smoke test only supports a local Supabase URL.");
}

(async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const appSockets = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) {
      errors.push(message.text());
    }
  });
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).searchParams.has("token")) appSockets.push(socket.url());
  });

  try {
    const email = `hosted-auth-${Date.now()}@example.test`;
    const password = "Pipelab-Test1!";

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("Hosted mode is ready.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Login / Register" }).click();
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.locator("#email-reg").fill(email);
    await page.locator("#password-reg input").fill(password);
    await page.locator("#confirmPassword input").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    await page.locator(".account-logout-btn").click();
    await page.getByRole("button", { name: "Login / Register" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Login / Register" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password input").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.getByText(email, { exact: true }).waitFor({ timeout: 15000 });

    assert.deepEqual(appSockets, [], `hosted auth opened app WebSockets: ${appSockets.join(", ")}`);
    assert.deepEqual(errors, [], `browser had errors: ${errors.join("; ")}`);
    console.log(
      "Local hosted auth passed: signup, refresh restore, sign-out, sign-in, no agent socket.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
